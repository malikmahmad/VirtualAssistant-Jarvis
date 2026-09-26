process.on('uncaughtException', (err) => {
  if (err.code === 'EPIPE') return; // Ignore broken pipe errors from MCP
  console.error('[Main] Uncaught Exception:', err);
});

require('dotenv').config();
const { app, BrowserWindow, ipcMain, systemPreferences, session, shell, protocol, net, globalShortcut } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const os = require('os');
const fs = require('fs');
const Groq = require('groq-sdk');

console.log("[Main] JARVIS Core Initializing...");
console.log(`[Main] Environment: SARVAM_KEY=${process.env.SARVAM_API_KEY ? 'Present' : 'Missing'}, GROQ_KEY=${process.env.GROQ_API_KEY ? 'Present' : 'Missing'}, OPENROUTER_KEY=${process.env.OPENROUTER_API_KEY ? 'Present' : 'Missing'}`);

// ── Groq API Key Rotation Pool ───────────────────────────────────────────
const GROQ_KEYS = [
  process.env.GROQ_API_KEY,
  process.env.GROQ_API_KEY_2,
  process.env.GROQ_API_KEY_3,
].filter(Boolean); // Remove undefined/empty keys

let currentKeyIndex = 0;
let groq = new Groq({ apiKey: GROQ_KEYS[currentKeyIndex] });

console.log(`[Groq] Key pool initialized with ${GROQ_KEYS.length} key(s). Active: Key #${currentKeyIndex + 1}`);

/**
 * Rotates to the next Groq API key. Returns true if rotated, false if all keys exhausted.
 */
function rotateGroqKey(reason) {
  currentKeyIndex = (currentKeyIndex + 1) % GROQ_KEYS.length;
  groq = new Groq({ apiKey: GROQ_KEYS[currentKeyIndex] });
  console.log(`[Groq] 🔄 Rotated to Key #${currentKeyIndex + 1} (Reason: ${reason})`);
  return true;
}

/**
 * Checks if an error is a key-exhaustion/quota/permission issue that warrants rotation.
 */
function isKeyExhausted(err) {
  const msg = (err.message || '').toLowerCase();
  const status = err.status || err.statusCode || 0;
  return (
    status === 429 ||
    status === 403 ||
    msg.includes('rate_limit') ||
    msg.includes('rate limit') ||
    msg.includes('quota') ||
    msg.includes('credits') ||
    msg.includes('limit_exhausted') ||
    msg.includes('permission') ||
    msg.includes('blocked')
  );
}

// ── MCP Configuration ───────────────────────────────────────────────────
let mcpClient = null;

async function setupMCP() {
  try {
    const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
    const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

    const transport = new StdioClientTransport({
      command: os.platform() === 'win32' ? 'python' : 'python3',
      args: [path.join(__dirname, 'mcp_server.py')]
    });

    mcpClient = new Client({
      name: "JarvisClient",
      version: "1.0.0"
    }, {
      capabilities: { tools: {} }
    });

    await mcpClient.connect(transport);
    console.log("[MCP] Connected to Python FastMCP Server!");
  } catch (e) {
    console.error("[MCP] Error setting up MCP:", e);
  }
}


// Suppress Chromium data pipe network errors in console
// app.commandLine.appendSwitch('log-level', '3');
// app.commandLine.appendSwitch('disable-logging');

const express = require('express');
const http = require('http');

let mainWindow;
let server;

const cors = require('cors');

function startLocalServer() {
  const app = express();
  const port = 3000;

  app.use(cors());
  app.use((req, res, next) => {
    console.log(`[Server] Request: ${req.url}`);
    next();
  });

  app.use(express.static(__dirname));

  server = http.createServer(app);
  server.listen(port, '0.0.0.0', () => {
    console.log(`[Main] Local JARVIS Server serving ${__dirname} at http://localhost:${port}`);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    frame: false,
    alwaysOnTop: true,
    transparent: true,
    backgroundColor: '#00000000',
    skipTaskbar: false,       // always show in taskbar
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
      experimentalFeatures: true,
      autoplayPolicy: 'no-user-gesture-required',
    },
    icon: path.join(__dirname, 'assets', 'icon.png'),
    titleBarStyle: 'hidden',
    show: false,
  });

  mainWindow.loadURL('http://localhost:3000/index.html');

  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    const levels = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
    console.log(`[Renderer] [${levels[level] || 'LOG'}] ${message}`);
  });

  mainWindow.once('ready-to-show', () => {
    console.log("[Main] Window ready, showing now.");
    mainWindow.show();
    mainWindow.maximize();
  });

  ipcMain.on('wake-up', () => {
    if (mainWindow) {
      mainWindow.setAlwaysOnTop(true);  // restore overlay behavior
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.maximize();
      mainWindow.focus();
      console.log("[Main] Wake-up received, window maximized.");
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ── Lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  await setupMCP();
  console.log(`[Main] Platform detected: ${process.platform}`);

  if (process.platform === 'darwin') {
    try {
      const status = systemPreferences.getMediaAccessStatus('microphone');
      console.log(`[Main] Current Mic Status: ${status}`);
      if (status !== 'granted') {
        const micAccess = await systemPreferences.askForMediaAccess('microphone');
        console.log(`[Main] macOS Mic Access Request: ${micAccess ? 'Granted' : 'Denied'}`);
        if (!micAccess) {
          console.warn("[Main] Microphone access denied. Opening System Settings...");
          shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone');
        }
      }
    } catch (err) {
      console.error('[Main] macOS Media access request failed:', err);
    }
  } else if (process.platform === 'win32') {
    const status = systemPreferences.getMediaAccessStatus('microphone');
    console.log(`[Main] Windows Microphone status: ${status}`);
  }

  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    console.log(`[Main] Permission Request: ${permission}`);
    const allowed = ['media', 'audioCapture', 'microphone', 'videoCapture'];
    if (allowed.includes(permission)) {
      console.log(`[Main] Permission Granted: ${permission}`);
      return callback(true);
    }
    console.warn(`[Main] Permission Denied: ${permission}`);
    callback(false);
  });
  session.defaultSession.setPermissionCheckHandler(() => {
    return true;
  });

  startLocalServer();
  createWindow();

  // Global hotkey — Ctrl+Shift+J brings JARVIS back from minimized state
  globalShortcut.register('CommandOrControl+Shift+J', () => {
    if (mainWindow) {
      mainWindow.setAlwaysOnTop(true);
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.maximize();
      mainWindow.focus();
      console.log("[Main] Global shortcut: JARVIS restored.");
    }
  });
  console.log("[Main] Global shortcut registered: Ctrl+Shift+J → Show JARVIS");
});

app.on('window-all-closed', () => {
  globalShortcut.unregisterAll();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
// COMMAND HANDLER — apps, system, web search, URLs, timers
// ═══════════════════════════════════════════════════════════════════════════

ipcMain.handle('run-command', async (event, data) => {

  // ── [1] Open Apps ───────────────────────────────────────────────────────
  if (data.action === 'open_app') {
    if (process.platform === 'darwin') {
      const macApps = {
        'notepad': 'open -a TextEdit',
        'chrome': 'open -a "Google Chrome"',
        'firefox': 'open -a Firefox',
        'calculator': 'open -a Calculator',
        'explorer': 'open ~',
        'vscode': 'open -a "Visual Studio Code"',
        'spotify': 'open -a Spotify',
        'discord': 'open -a Discord',
        'figma': 'open -a Figma',
        'vlc': 'open -a VLC',
        'zoom': 'open -a zoom.us',
        'telegram': 'open -a Telegram',
        'whatsapp': 'open -a WhatsApp',
        'brave': 'open -a "Brave Browser"',
        'opera': 'open -a Opera',
        'obs': 'open -a OBS',
        'steam': 'open -a Steam',
        'edge': 'open -a "Microsoft Edge"',
        'outlook': 'open -a "Microsoft Outlook"',
        'word': 'open -a "Microsoft Word"',
        'excel': 'open -a "Microsoft Excel"',
        'powerpoint': 'open -a "Microsoft PowerPoint"',
        'cmd': 'open -a Terminal',
        'terminal': 'open -a Terminal',
        'settings': 'open -a "System Preferences" || open -a "System Settings"',
        'paint': 'open -a Paintbrush || open -a Preview',
      };
      const cmd = macApps[data.app];
      if (cmd) {
        return new Promise(r => exec(cmd, (err) => r({ success: !err, error: err?.message })));
      }
      return { success: false, error: `Unknown app: ${data.app}` };
    }

    // ── WINDOWS APP LAUNCH ──
    if (process.platform === 'win32') {
      const winApps = {
        'notepad':      'start notepad.exe',
        'calculator':   'start calc.exe',
        'paint':        'start mspaint.exe',
        'explorer':     'start explorer.exe',
        'cmd':          'start cmd.exe',
        'terminal':     'start wt.exe 2>nul || start cmd.exe',
        'powershell':   'start powershell.exe',
        'task manager': 'start taskmgr.exe',
        'settings':     'start ms-settings:',
        'control panel':'start control.exe',
        'chrome':       'start chrome.exe 2>nul || start "" "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"',
        'firefox':      'start firefox.exe 2>nul || start "" "C:\\Program Files\\Mozilla Firefox\\firefox.exe"',
        'edge':         'start msedge.exe',
        'brave':        'start brave.exe 2>nul || start "" "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe"',
        'opera':        'start opera.exe',
        'spotify':      'start spotify.exe 2>nul || start "" "%APPDATA%\\Spotify\\Spotify.exe"',
        'discord':      'start discord.exe 2>nul || start "" "%LOCALAPPDATA%\\Discord\\Update.exe" --processStart Discord.exe',
        'steam':        'start steam.exe 2>nul || start "" "C:\\Program Files (x86)\\Steam\\steam.exe"',
        'vlc':          'start vlc.exe 2>nul || start "" "C:\\Program Files\\VideoLAN\\VLC\\vlc.exe"',
        'vscode':       'start code.exe 2>nul || start "" "%LOCALAPPDATA%\\Programs\\Microsoft VS Code\\Code.exe"',
        'word':         'start winword.exe',
        'excel':        'start excel.exe',
        'powerpoint':   'start powerpnt.exe',
        'outlook':      'start outlook.exe',
        'zoom':         'start zoom.exe 2>nul || start "" "%APPDATA%\\Zoom\\bin\\Zoom.exe"',
        'telegram':     'start telegram.exe 2>nul || start "" "%APPDATA%\\Telegram Desktop\\Telegram.exe"',
        'whatsapp':     'start "" "ms-chat:"  2>nul || start whatsapp.exe',
        'obs':          'start obs64.exe 2>nul || start "" "C:\\Program Files\\obs-studio\\bin\\64bit\\obs64.exe"',
        'figma':        'start figma.exe 2>nul',
        'snipping tool':'start snippingtool.exe',
        'photos':       'start ms-photos:',
        'store':        'start ms-windows-store:',
        'camera':       'start microsoft.windows.camera:',
        'clock':        'start ms-clock:',
        'maps':         'start bingmaps:',
        'mail':         'start outlookmail:',
      };
      const appKey = (data.app || '').toLowerCase();
      const cmd = winApps[appKey];
      if (cmd) {
        return new Promise(r => exec(cmd, (err) => r({ success: !err, error: err?.message })));
      }
      // Generic fallback — try to start by name directly
      return new Promise(r => exec(`start ${data.app}`, (err) => r({ success: !err, error: err?.message })));
    }
    return { success: false, error: 'Unsupported platform.' };
  }

  // ── [2] System Commands ─────────────────────────────────────────────────
  if (data.action === 'system') {
    if (process.platform === 'darwin') {
      const macCmds = {
        'shutdown': 'sudo shutdown -h now',
        'restart': 'sudo shutdown -r now',
        'sleep': 'pmset sleepnow',
        'lock': 'pmset displaysleepnow',
        'mute': 'osascript -e "set volume output muted true"',
        'volume_up': `osascript -e "set volume output volume ((output volume of (get volume settings)) + ${data.amount || 10})"`,
        'volume_down': `osascript -e "set volume output volume ((output volume of (get volume settings)) - ${data.amount || 10})"`,
        'screenshot': `screencapture "${path.join(os.homedir(), 'Desktop', `screenshot_${Date.now()}.png`)}"`,
      };
      const cmd = macCmds[data.command];
      if (cmd) {
        return new Promise(r => exec(cmd, (err) => r({ success: !err, error: err?.message })));
      }
    }

    // ── WINDOWS SYSTEM COMMANDS ──
    if (process.platform === 'win32') {
      const screenshotPath = path.join(os.homedir(), 'Desktop', `screenshot_${Date.now()}.png`);
      const winCmds = {
        'shutdown':     'shutdown /s /t 5',
        'restart':      'shutdown /r /t 5',
        'sleep':        'rundll32.exe powrprof.dll,SetSuspendState 0,1,0',
        'lock':         'rundll32.exe user32.dll,LockWorkStation',
        'mute':         'powershell -c "(New-Object -ComObject WScript.Shell).SendKeys([char]173)"',
        'unmute':       'powershell -c "(New-Object -ComObject WScript.Shell).SendKeys([char]173)"',
        'volume_up':    'powershell -c "$obj = New-Object -ComObject WScript.Shell; for($i=0;$i -lt 5;$i++){$obj.SendKeys([char]175)}"',
        'volume_down':  'powershell -c "$obj = New-Object -ComObject WScript.Shell; for($i=0;$i -lt 5;$i++){$obj.SendKeys([char]174)}"',
        'screenshot':   `powershell -c "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('%{PRTSC}'); Start-Sleep -m 500; $img = [System.Windows.Forms.Clipboard]::GetImage(); $img.Save('${screenshotPath}')"`,
        'empty_trash':  'powershell -c "Clear-RecycleBin -Force -ErrorAction SilentlyContinue"',
        'show_desktop': 'powershell -c "(New-Object -ComObject Shell.Application).MinimizeAll()"',
        'task_manager': 'start taskmgr.exe',
      };
      const cmd = winCmds[data.command];
      if (cmd) {
        return new Promise(r => exec(cmd, (err) => r({ success: !err, error: err?.message })));
      }
    }
    return { success: false, error: `Unknown system command: ${data.command}` };
  }

  // ── [3] Web Search ──────────────────────────────────────────────────────
  if (data.action === 'web_search') {
    const query = encodeURIComponent(data.query);
    const url = `https://www.google.com/search?q=${query}`;
    const cmd = process.platform === 'darwin' ? `open "${url}"` : `start "" "${url}"`;
    return new Promise(r => exec(cmd, (err) => r({ success: !err, error: err?.message })));
  }

  // ── [4] Open URL ────────────────────────────────────────────────────────
  if (data.action === 'open_url') {
    const url = data.url.startsWith('http') ? data.url : `https://${data.url}`;
    const cmd = process.platform === 'darwin' ? `open "${url}"` : `start "" "${url}"`;
    return new Promise(r => exec(cmd, (err) => r({ success: !err, error: err?.message })));
  }

  // ── [5] Set Timer ───────────────────────────────────────────────────────
  if (data.action === 'set_timer') {
    const seconds = data.duration_seconds || 60;
    const label = data.label || 'Timer';
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('timer-done', label);
      }
    }, seconds * 1000);
    return { success: true, message: `Timer set for ${seconds} seconds` };
  }

  // ── [6] Get System Info ─────────────────────────────────────────────────
  if (data.action === 'get_system_info') {
    const info = {
      platform: os.platform(),
      hostname: os.hostname(),
      cpus: os.cpus().length,
      totalMemGB: (os.totalmem() / (1024**3)).toFixed(1),
      freeMemGB: (os.freemem() / (1024**3)).toFixed(1),
      uptimeHrs: (os.uptime() / 3600).toFixed(1),
      arch: os.arch(),
    };
    return { success: true, info };
  }

  // ── [7] Type Text ───────────────────────────────────────────────────────
  if (data.action === 'type_text') {
    if (process.platform === 'win32') {
      const escaped = (data.text || '').replace(/'/g, "''");
      const cmd = `powershell -c "(New-Object -ComObject WScript.Shell).SendKeys('${escaped}')"`;
      return new Promise(r => exec(cmd, (err) => r({ success: !err, error: err?.message })));
    }
    return { success: false, error: 'type_text only supported on Windows' };
  }

  // ── [8] Run Shell / PowerShell Command ─────────────────────────────────
  if (data.action === 'run_shell') {
    const command = data.command || '';
    if (!command) return { success: false, error: 'No command provided' };
    return new Promise(r => {
      exec(command, { timeout: 15000, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
        r({ success: !err, output: stdout?.trim() || stderr?.trim() || '', error: err?.message });
      });
    });
  }

  // ── [9] File Operations ─────────────────────────────────────────────────
  if (data.action === 'file_op') {
    const op = data.op;

    // Read file
    if (op === 'read') {
      try {
        const content = fs.readFileSync(data.path, 'utf-8');
        return { success: true, content };
      } catch (e) { return { success: false, error: e.message }; }
    }

    // Write file
    if (op === 'write') {
      try {
        fs.writeFileSync(data.path, data.content || '', 'utf-8');
        return { success: true };
      } catch (e) { return { success: false, error: e.message }; }
    }

    // Delete file
    if (op === 'delete') {
      try {
        fs.unlinkSync(data.path);
        return { success: true };
      } catch (e) { return { success: false, error: e.message }; }
    }

    // List directory
    if (op === 'list') {
      try {
        const items = fs.readdirSync(data.path, { withFileTypes: true });
        return { success: true, items: items.map(i => ({ name: i.name, isDir: i.isDirectory() })) };
      } catch (e) { return { success: false, error: e.message }; }
    }

    // Create folder
    if (op === 'mkdir') {
      try {
        fs.mkdirSync(data.path, { recursive: true });
        return { success: true };
      } catch (e) { return { success: false, error: e.message }; }
    }

    // Rename / Move
    if (op === 'rename') {
      try {
        fs.renameSync(data.from, data.to);
        return { success: true };
      } catch (e) { return { success: false, error: e.message }; }
    }

    // Check if path exists
    if (op === 'exists') {
      return { success: true, exists: fs.existsSync(data.path) };
    }

    return { success: false, error: `Unknown file op: ${op}` };
  }

  // ── [10] Clipboard ──────────────────────────────────────────────────────
  if (data.action === 'clipboard') {
    if (data.op === 'write') {
      return new Promise(r => {
        const escaped = (data.text || '').replace(/"/g, '\\"');
        exec(`powershell -c "Set-Clipboard -Value \\"${escaped}\\""`, (err) => r({ success: !err, error: err?.message }));
      });
    }
    if (data.op === 'read') {
      return new Promise(r => {
        exec(`powershell -c "Get-Clipboard"`, (err, stdout) => r({ success: !err, text: stdout?.trim(), error: err?.message }));
      });
    }
  }

  // ── [11] Battery Info ───────────────────────────────────────────────────
  if (data.action === 'get_battery') {
    return new Promise(r => {
      exec(`powershell -c "Get-WmiObject Win32_Battery | Select-Object EstimatedChargeRemaining, BatteryStatus | ConvertTo-Json"`, (err, stdout) => {
        try {
          const bat = JSON.parse(stdout);
          const level = bat.EstimatedChargeRemaining;
          const charging = bat.BatteryStatus === 2;
          r({ success: true, level, charging });
        } catch { r({ success: false, error: 'Battery info unavailable' }); }
      });
    });
  }

  // ── [12] WiFi — List & Connect ──────────────────────────────────────────
  if (data.action === 'wifi') {
    if (data.op === 'list') {
      return new Promise(r => {
        exec(`netsh wlan show networks mode=bssid`, (err, stdout) => r({ success: !err, output: stdout?.trim(), error: err?.message }));
      });
    }
    if (data.op === 'connect') {
      return new Promise(r => {
        exec(`netsh wlan connect name="${data.ssid}"`, (err, stdout) => r({ success: !err, output: stdout?.trim(), error: err?.message }));
      });
    }
    if (data.op === 'status') {
      return new Promise(r => {
        exec(`netsh wlan show interfaces`, (err, stdout) => r({ success: !err, output: stdout?.trim(), error: err?.message }));
      });
    }
  }

  // ── [13] Brightness Control ─────────────────────────────────────────────
  if (data.action === 'brightness') {
    const level = Math.max(0, Math.min(100, data.level || 50));
    const cmd = `powershell -c "(Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightnessMethods).WmiSetBrightness(1, ${level})"`;
    return new Promise(r => exec(cmd, (err) => r({ success: !err, error: err?.message })));
  }

  // ── [14] Running Processes ──────────────────────────────────────────────
  if (data.action === 'get_processes') {
    return new Promise(r => {
      exec(`powershell -c "Get-Process | Sort-Object CPU -Descending | Select-Object -First 20 Name, CPU, WorkingSet | ConvertTo-Json"`, (err, stdout) => {
        try {
          const procs = JSON.parse(stdout);
          r({ success: true, processes: procs });
        } catch { r({ success: false, error: 'Could not list processes' }); }
      });
    });
  }

  // ── [15] Kill Process ───────────────────────────────────────────────────
  if (data.action === 'kill_process') {
    const name = data.name || '';
    const cmd = `powershell -c "Stop-Process -Name '${name}' -Force -ErrorAction SilentlyContinue"`;
    return new Promise(r => exec(cmd, (err) => r({ success: !err, error: err?.message })));
  }

  // ── [16] Disk Info ──────────────────────────────────────────────────────
  if (data.action === 'get_disk_info') {
    return new Promise(r => {
      exec(`powershell -c "Get-PSDrive -PSProvider FileSystem | Select-Object Name, @{N='UsedGB';E={[math]::Round(($_.Used/1GB),1)}}, @{N='FreeGB';E={[math]::Round(($_.Free/1GB),1)}} | ConvertTo-Json"`, (err, stdout) => {
        try {
          const disks = JSON.parse(stdout);
          r({ success: true, disks: Array.isArray(disks) ? disks : [disks] });
        } catch { r({ success: false, error: 'Disk info unavailable' }); }
      });
    });
  }

  // ── [17] Open File/Folder in Explorer ──────────────────────────────────
  if (data.action === 'open_path') {
    const target = data.path || os.homedir();
    const cmd = `explorer "${target}"`;
    return new Promise(r => exec(cmd, (err) => r({ success: true })));
  }

  // ── [18] Network Info ───────────────────────────────────────────────────
  if (data.action === 'get_network_info') {
    return new Promise(r => {
      exec(`powershell -c "Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.InterfaceAlias -notlike '*Loopback*'} | Select-Object InterfaceAlias, IPAddress | ConvertTo-Json"`, (err, stdout) => {
        try {
          const net = JSON.parse(stdout);
          r({ success: true, info: Array.isArray(net) ? net : [net] });
        } catch { r({ success: false, error: 'Network info unavailable' }); }
      });
    });
  }

  // ── [19] Installed Apps Search ──────────────────────────────────────────
  if (data.action === 'search_installed') {
    const query = (data.query || '').replace(/'/g, "''");
    return new Promise(r => {
      exec(`powershell -c "Get-WmiObject -Class Win32_Product | Where-Object {$_.Name -like '*${query}*'} | Select-Object Name, Version | ConvertTo-Json"`, { timeout: 30000 }, (err, stdout) => {
        try {
          const apps = JSON.parse(stdout || '[]');
          r({ success: true, apps: Array.isArray(apps) ? apps : [apps] });
        } catch { r({ success: true, apps: [] }); }
      });
    });
  }

  // ── [20] Send Keyboard Shortcut ─────────────────────────────────────────
  if (data.action === 'keyboard_shortcut') {
    const keys = data.keys || '';
    const cmd = `powershell -c "(New-Object -ComObject WScript.Shell).SendKeys('${keys}')"`;
    return new Promise(r => exec(cmd, (err) => r({ success: !err, error: err?.message })));
  }

  return { success: false, error: 'Unknown action' };
});

// ── Permissions IPC ───────────────────────────────────────────────────────
ipcMain.handle('request-mic-permission', async () => {
  if (process.platform === 'darwin') {
    const status = systemPreferences.getMediaAccessStatus('microphone');
    if (status === 'granted') return true;

    const granted = await systemPreferences.askForMediaAccess('microphone');
    if (!granted) {
      shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone');
    }
    return granted;
  }

  if (process.platform === 'win32') {
    const status = systemPreferences.getMediaAccessStatus('microphone');
    if (status === 'granted') return true;

    // Windows 10+ handles this via ms-settings
    shell.openExternal('ms-settings:privacy-microphone');
    return false; // User must manually enable and restart
  }

  return true;
});

// ── Window Controls ───────────────────────────────────────────────────────
ipcMain.on('minimize-window', () => {
  if (mainWindow) {
    mainWindow.setAlwaysOnTop(false); // allow other apps to be on top
    mainWindow.minimize();
  }
});

// hide-window = minimize (keeps taskbar icon, allows apps to come to front)
ipcMain.on('hide-window', () => {
  if (mainWindow) {
    mainWindow.setAlwaysOnTop(false);
    mainWindow.minimize();
  }
});

ipcMain.on('maximize-window', () => {
  if (mainWindow) {
    mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
  }
});

ipcMain.handle('maximize-window', () => {
  if (mainWindow) {
    mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
  }
  return true;
});

ipcMain.on('close-window', () => {
  if (mainWindow) mainWindow.close();
});

// ── Lifecycle ─────────────────────────────────────────────────────────────

// ── Groq TTS Handler (with Key Rotation) ─────────────────────────────────
ipcMain.handle('groq-tts', async (event, text) => {
  const maxRetries = GROQ_KEYS.length;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      console.log(`[Groq TTS] Generating speech (Key #${currentKeyIndex + 1}): "${text.substring(0, 50)}..."`);

      const response = await groq.audio.speech.create({
        model: 'canopylabs/orpheus-v1-english',
        voice: 'autumn',   // Natural female voice
        input: text,
        response_format: 'wav'
      });

      const buffer = Buffer.from(await response.arrayBuffer());
      const base64 = buffer.toString('base64');

      console.log(`[Groq TTS] Audio generated: ${buffer.length} bytes`);
      return { success: true, audio: base64 };
    } catch (err) {
      console.error(`[Groq TTS] Error (Key #${currentKeyIndex + 1}):`, err.message);
      if (isKeyExhausted(err) && rotateGroqKey(`TTS: ${err.message.substring(0, 60)}`)) {
        continue; // Retry with next key
      }
      return { success: false, error: err.message };
    }
  }
  return { success: false, error: 'ALL_KEYS_EXHAUSTED' };
});

// ── Sarvam TTS Handler (Bulbul v1) ───────────────────────────────────────
ipcMain.handle('sarvam-tts', async (event, text) => {
  try {
    console.log(`[Sarvam TTS] Generating speech for: "${text.substring(0, 50)}..."`);

    const response = await fetch('https://api.sarvam.ai/text-to-speech', {
      method: 'POST',
      headers: {
        'api-subscription-key': process.env.SARVAM_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: text,
        speaker: "simran",
        target_language_code: "en-IN",
        model: "bulbul:v3",
        audio_format: "wav"
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('[Sarvam TTS] Full Error Response:', JSON.stringify(errorData, null, 2));
      throw new Error(errorData.message || errorData.error || `Sarvam API error: ${response.statusText}`);
    }

    const data = await response.json();
    if (!data.audios || !data.audios[0]) {
      throw new Error('Sarvam TTS returned no audio data');
    }

    console.log(`[Sarvam TTS] Audio generated successfully.`);
    return { success: true, audio: data.audios[0] };
  } catch (err) {
    console.error('[Sarvam TTS] Error:', err.message);
    return { success: false, error: err.message };
  }
});

// ── Groq Chat Handler (with Key Rotation) ────────────────────────────────
ipcMain.handle('groq-chat', async (event, messages) => {
  const maxKeyRetries = GROQ_KEYS.length;

  for (let keyAttempt = 0; keyAttempt < maxKeyRetries; keyAttempt++) {
    try {
      console.log(`[Groq Chat] Sending ${messages.length} messages... (Key #${currentKeyIndex + 1})`);

      let tools = [];
      if (mcpClient) {
        const response = await mcpClient.listTools();
        tools = response.tools.map(tool => ({
          type: "function",
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema
          }
        }));
      }

      const models = ["meta-llama/llama-4-scout-17b-16e-instruct", "llama-3.3-70b-versatile", "qwen/qwen3-32b", "llama-3.1-8b-instant"];
      let chatCompletion = null;
      let lastError = null;

      for (const model of models) {
        try {
          console.log(`[Groq Chat] Attempting with model: ${model}`);
          chatCompletion = await groq.chat.completions.create({
            messages: messages,
            model: model,
            tools: tools.length > 0 ? tools : undefined,
            tool_choice: tools.length > 0 ? "auto" : "none"
          });
          break; // Success!
        } catch (err) {
          lastError = err;
          const errMsg = (err.message || "").toLowerCase();

          // If it's a model-level limit, decommissioned, or the model itself is blocked/permission denied
          if (errMsg.includes("rate_limit") || errMsg.includes("quota") || err.status === 429 || errMsg.includes("model_permission") || errMsg.includes("model is blocked") || errMsg.includes("blocked at the organization level") || errMsg.includes("decommissioned") || errMsg.includes("not_found") || errMsg.includes("does not exist")) {
            console.warn(`[Groq Chat] Model ${model} unavailable. Trying fallback model...`);
            continue;
          }
          // If it's a true key-level issue (invalid API key, global quota), throw to trigger key rotation
          if (isKeyExhausted(err)) throw err;
          throw err;
        }
      }

      // All models failed with this key → rotate
      if (!chatCompletion) throw lastError;

      let message = chatCompletion.choices[0]?.message;

      // Handle Tool Calls if the LLM decides to use one
      if (message?.tool_calls) {
        messages.push(message);

        for (const toolCall of message.tool_calls) {
          if (mcpClient) {
            console.log(`[MCP] Executing tool: ${toolCall.function.name}`);
            const args = JSON.parse(toolCall.function.arguments);
            const result = await mcpClient.callTool({
              name: toolCall.function.name,
              arguments: args
            });

            let content = "Success";
            if (result.content && result.content.length > 0) {
              content = result.content[0].text;
            }

            messages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              name: toolCall.function.name,
              content: content
            });
          }
        }

        // Request final response after tool execution
        for (const model of models) {
          try {
            chatCompletion = await groq.chat.completions.create({
              messages: messages,
              model: model
            });
            break;
          } catch (err) {
            const em = (err.message || '').toLowerCase();
            if (em.includes("rate_limit") || err.status === 429 || em.includes("decommissioned") || em.includes("not_found") || em.includes("does not exist")) continue;
            if (isKeyExhausted(err)) throw err;
            throw err;
          }
        }
        message = chatCompletion.choices[0]?.message;
      }

      const reply = message?.content || "";
      return { success: true, reply, messages };

    } catch (err) {
      console.error(`[Groq Chat] Error (Key #${currentKeyIndex + 1}):`, err.message);
      // Try rotating to next key
      if (isKeyExhausted(err) && rotateGroqKey(`Chat: ${err.message.substring(0, 60)}`)) {
        continue; // Retry entire chat with next key
      }
      return {
        success: false,
        error: isKeyExhausted(err) ? "GROQ_LIMIT_EXHAUSTED" : err.message
      };
    }
  }
  return { success: false, error: "GROQ_LIMIT_EXHAUSTED" };
});

ipcMain.handle('mcp-tool', async (event, toolName, args) => {
  if (!mcpClient) return { success: false, error: "MCP Client not initialized" };
  try {
    console.log(`[MCP] Explicit tool call from Renderer: ${toolName}`);
    const result = await mcpClient.callTool({
      name: toolName,
      arguments: args
    });
    let content = "Success";
    if (result.content && result.content.length > 0) {
      content = result.content[0].text;
    }
    return { success: true, content };
  } catch (err) {
    console.error(`[MCP] Tool call error: ${err.message}`);
    return { success: false, error: err.message };
  }
});

// ── Gemini Chat Handler (Final Response) ──────────────────────────────────
ipcMain.handle('gemini-chat', async (event, messages) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not defined");

    const contents = messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content || "Result processed." }]
      }));

    // Use gemini-3-flash-preview as requested (Experimental)
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents })
    });

    if (!response.ok) {
      const error = await response.json();
      const msg = error.error?.message || "Gemini API Error";
      const isQuota = msg.toLowerCase().includes('quota') || msg.toLowerCase().includes('limit');
      throw new Error(isQuota ? "GEMINI_LIMIT_EXHAUSTED" : msg);
    }

    const data = await response.json();
    const reply = data.candidates[0].content.parts[0].text;

    return { success: true, reply };
  } catch (err) {
    console.error('[Gemini Chat] Error:', err.message);
    return { success: false, error: err.message };
  }
});

// ── OpenRouter Chat Handler (Gemma 4 + Reasoning) ───────────────────────
let openRouterAbort = null; // Dedup: cancel in-flight requests if user barges in

ipcMain.handle('openrouter-chat', async (event, { messages, useReasoning = true }) => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return { success: false, error: 'OPENROUTER_API_KEY not set' };

  // Cancel any previous in-flight request (barge-in support)
  if (openRouterAbort) {
    openRouterAbort.abort();
    openRouterAbort = null;
  }
  const controller = new AbortController();
  openRouterAbort = controller;

  // Model cascade
  const REASONING_MODELS = new Set([]);
  const MODELS = [
    'meta-llama/llama-4-maverick:free',
    'meta-llama/llama-4-scout:free',
    'deepseek/deepseek-r1-0528:free',
    'openrouter/auto',
  ];

  for (const model of MODELS) {
    try {
      const modelSupportsReasoning = useReasoning && REASONING_MODELS.has(model);
      console.log(`[OpenRouter] Attempting ${model} (reasoning: ${modelSupportsReasoning})...`);

      // Build the API payload — preserve reasoning_details in assistant messages
      const apiMessages = messages.map(m => {
        const msg = { role: m.role, content: m.content };
        if (m.role === 'assistant' && m.reasoning_details && modelSupportsReasoning) {
          msg.reasoning_details = m.reasoning_details;
        }
        return msg;
      });

      const body = {
        model,
        messages: apiMessages,
        max_tokens: 1024,
      };
      if (modelSupportsReasoning) {
        body.reasoning = { enabled: true };
      }

      const startMs = Date.now();
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://jarvis-assistant.local',
          'X-Title': 'JARVIS AI Assistant',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        const errMsg = errBody.error?.message || response.statusText;
        console.warn(`[OpenRouter] ${model} failed (${response.status}): ${errMsg}`);
        // If rate-limited or model unavailable, try next model
        if (response.status === 429 || response.status === 503 || response.status === 402 || response.status === 400) continue;
        throw new Error(errMsg);
      }

      const data = await response.json();
      const latencyMs = Date.now() - startMs;
      const choice = data.choices?.[0];
      if (!choice) throw new Error('No choices returned');

      const assistantMessage = choice.message;
      const reply = assistantMessage.content || '';
      const reasoning = assistantMessage.reasoning_details || assistantMessage.reasoning || null;

      console.log(`[OpenRouter] ✅ ${model} responded in ${latencyMs}ms (${reply.length} chars)`);
      if (reasoning) console.log(`[OpenRouter] 🧠 Reasoning attached (${JSON.stringify(reasoning).length} chars)`);

      openRouterAbort = null;
      return {
        success: true,
        reply,
        reasoning_details: reasoning,
        model,
        latencyMs,
        usage: data.usage || null,
      };
    } catch (err) {
      if (err.name === 'AbortError') {
        console.log('[OpenRouter] Request aborted (user barged in).');
        return { success: false, error: 'ABORTED' };
      }
      console.warn(`[OpenRouter] ${model} error: ${err.message}`);
      continue; // Try next model
    }
  }

  openRouterAbort = null;
  return { success: false, error: 'ALL_OPENROUTER_MODELS_EXHAUSTED' };
});

// ── Groq STT Handler (Whisper, with Key Rotation) ───────────────────────
ipcMain.handle('groq-stt', async (event, buffer) => {
  const tempPath = path.join(os.tmpdir(), `jarvis_audio_${Date.now()}.webm`);
  fs.writeFileSync(tempPath, Buffer.from(buffer));

  const maxRetries = GROQ_KEYS.length;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      console.log(`[Groq STT] Transcribing audio (Key #${currentKeyIndex + 1})...`);
      const transcription = await groq.audio.transcriptions.create({
        file: fs.createReadStream(tempPath),
        model: "whisper-large-v3-turbo",
        // No language lock — Whisper auto-detects English AND Urdu both perfectly
      });
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      return { success: true, text: transcription.text };
    } catch (err) {
      console.error(`[Groq STT] Error (Key #${currentKeyIndex + 1}):`, err.message);
      if (isKeyExhausted(err) && rotateGroqKey(`STT: ${err.message.substring(0, 60)}`)) {
        continue;
      }
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      return { success: false, error: isKeyExhausted(err) ? "GROQ_STT_LIMIT_EXHAUSTED" : err.message };
    }
  }
  if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
  return { success: false, error: 'ALL_KEYS_EXHAUSTED' };
});

// ── Sarvam STT Handler (Saaras v3) ───────────────────────────────────────
ipcMain.handle('sarvam-stt', async (event, buffer) => {
  try {
    console.log(`[Sarvam STT] Processing audio buffer (${buffer.byteLength} bytes)...`);

    // Saaras v3 works best with WAV/MP3. 
    // The buffer from renderer is likely webm/opus (default MediaRecorder).
    // Sarvam supports OPUS/OGG so we can send it directly.

    const formData = new FormData();
    const audioBlob = new Blob([buffer], { type: 'audio/webm' });

    formData.append('file', audioBlob, 'audio.webm');
    formData.append('model', 'saaras:v3');
    formData.append('language_code', 'en-IN'); // Optimized for Indian English context
    formData.append('with_timestamps', 'false');

    console.log("[Sarvam STT] Sending request to Sarvam AI...");
    const response = await fetch('https://api.sarvam.ai/speech-to-text', {
      method: 'POST',
      headers: {
        'api-subscription-key': process.env.SARVAM_API_KEY
      },
      body: formData
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('[Sarvam STT] Full Error Response:', JSON.stringify(errorData, null, 2));
      throw new Error(errorData.message || errorData.error || `Sarvam API error: ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`[Sarvam STT] Transcription: ${data.transcript}`);
    return { success: true, text: data.transcript };
  } catch (err) {
    console.error('[Sarvam STT] Error Details:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('get-env', (event, key) => {
  return process.env[key];
});

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('assistant', {
  // Wake Up UI
  wakeUp: () => ipcRenderer.send('wake-up'),

  // Unified command handler for all actions
  runCommand: (data) => ipcRenderer.invoke('run-command', data),

  // Groq Text-to-Speech
  groqTTS: (text) => ipcRenderer.invoke('groq-tts', text),

  // Sarvam Text-to-Speech
  sarvamTTS: (text) => ipcRenderer.invoke('sarvam-tts', text),

  // Groq Chat Completions
  groqChat: (messages) => ipcRenderer.invoke('groq-chat', messages),

  // Gemini Chat (Persona)
  geminiChat: (messages) => ipcRenderer.invoke('gemini-chat', messages),

  // OpenRouter Chat (Gemma 4 + Reasoning)
  openRouterChat: (payload) => ipcRenderer.invoke('openrouter-chat', payload),

  // Groq Speech-to-Text (Whisper)
  groqSTT: (buffer) => ipcRenderer.invoke('groq-stt', buffer),

  // Sarvam Speech-to-Text
  sarvamSTT: (buffer) => ipcRenderer.invoke('sarvam-stt', buffer),

  // Listen for timer completions
  onTimerDone: (callback) => {
    ipcRenderer.on('timer-done', (_event, label) => callback(label));
  },

  // Listen for welcome trigger from main
  onStartWelcome: (callback) => {
    ipcRenderer.on('start-welcome', () => callback());
  },

  // Window controls
  minimizeWindow: () => ipcRenderer.send('minimize-window'),
  hideWindow: () => ipcRenderer.send('hide-window'),
  maximizeWindow: () => ipcRenderer.invoke('maximize-window'),
  closeWindow: () => ipcRenderer.send('close-window'),

  // Permissions
  requestMicPermission: () => ipcRenderer.invoke('request-mic-permission'),
  
  // MCP Tool Execution
  callTool: (toolName, args) => ipcRenderer.invoke('mcp-tool', toolName, args),

  // Environment Variables
  getEnv: (key) => ipcRenderer.invoke('get-env', key),
});

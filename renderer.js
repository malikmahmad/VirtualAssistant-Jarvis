/* ═══════════════════════════════════════════════════════════════════════════
   JARVIS HUD v3.0 — RENDERER, VISUALS, & PREMIUM INTELLIGENCE
   ═══════════════════════════════════════════════════════════════════════════ */

// ── UI ELEMENTS ──
const userTextEl = document.getElementById('user-text');
const jarvisTextEl = document.getElementById('jarvis-text');
const mainClock = document.getElementById('main-clock');
const statusPill = document.getElementById('status-pill');
const cmdsPillCount = document.getElementById('cmd-count');

let cmdsExecuted = 0;
let isListening = false;
let isProcessing = false;
let isSpeaking = false;
let isUserSpeaking = false;
let autoListen = true;
let vadEnabled = false; // stays false during welcome — set true only after welcome finishes
let usePremiumSTT = true;
let STT_ENGINE = 'GROQ';
let conversationHistory = [];
let useGroqTTS = false;
let sttInitialized = false; // prevent double STT init

// ═══════════════════════════════════════════════════════════════════════════
// PERSISTENT MEMORY SYSTEM — Remembers user facts across sessions
// ═══════════════════════════════════════════════════════════════════════════

const CREATOR_PROFILE = {
  fullName: "Malik Muhammad Ahmad",
  nationality: "Pakistani",
  country: "Pakistan",
  religion: "Islam",
  dateOfBirth: "5 October 2005",
  language: "English",
  education: "Bachelor of Science in Information Technology (BS IT) — In Progress",
  university: "Muhammad Nawaz Sharif University of Engineering and Technology (MNS-UET), Multan",
  interests: "Information Technology, Software Development, Artificial Intelligence, and Emerging Technologies",
  bio: "Malik Muhammad Ahmad is a Pakistani Information Technology student at MNS-UET, Multan. Born on 5 October 2005, he is pursuing a BS IT degree and has a strong passion for software development, artificial intelligence, and emerging digital solutions. He aims to build a successful career as a skilled IT professional and entrepreneur."
};

// Persistent user memory — survives app restarts
let userMemory = JSON.parse(localStorage.getItem('jarvis_user_memory') || '{}');

function saveMemory() {
  localStorage.setItem('jarvis_user_memory', JSON.stringify(userMemory));
}

function rememberFact(key, value) {
  userMemory[key] = { value, timestamp: Date.now() };
  saveMemory();
  console.log(`[Memory] Stored: ${key} = ${value}`);
}

function recallFact(key) {
  return userMemory[key]?.value || null;
}

function getAllMemories() {
  const entries = Object.entries(userMemory);
  if (entries.length === 0) return '';
  return entries.map(([k, v]) => `- ${k}: ${v.value}`).join('\n');
}

// Auto-extract facts from user messages
function extractAndStoreFacts(text) {
  const lower = text.toLowerCase();
  
  // Name extraction
  const nameMatch = text.match(/(?:my name is|i'm|i am|call me)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
  if (nameMatch) rememberFact('user_name', nameMatch[1].trim());
  
  // Age
  const ageMatch = text.match(/(?:i'm|i am|my age is)\s+(\d{1,2})\s*(?:years|year|yrs)?\s*(?:old)?/i);
  if (ageMatch) rememberFact('user_age', ageMatch[1]);
  
  // Location
  const locMatch = text.match(/(?:i live in|i'm from|i am from|i'm in|based in|located in)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})/i);
  if (locMatch) rememberFact('user_location', locMatch[1].trim());
  
  // Job/Profession
  const jobMatch = text.match(/(?:i work as|i'm a|i am a|my job is|i work at|my profession is)\s+(.{3,40}?)(?:\.|,|$)/i);
  if (jobMatch) rememberFact('user_profession', jobMatch[1].trim());
  
  // Favorites
  const favMatch = text.match(/(?:my favorite|i love|i like|i enjoy|i prefer)\s+(.{3,40}?)(?:\.|,|$)/i);
  if (favMatch) rememberFact('user_likes_' + Date.now(), favMatch[1].trim());
  
  // College/School
  const eduMatch = text.match(/(?:i study at|i go to|i'm studying|my college is|my school is|i attend)\s+(.{3,50}?)(?:\.|,|$)/i);
  if (eduMatch) rememberFact('user_education', eduMatch[1].trim());
}

let jarvisAsleep = true; // starts asleep until welcome completes
let welcomeDone = false; // listening only starts after welcome + question
let sleepTimer = null;
const sessionStartTime = Date.now();

let lastClapTime = 0;
function detectClap(dataArray) {
  // Clap detection disabled — app now auto-starts welcome on open
  return;
}

/**
 * Intro sequence — directly runs briefing
 */
function playIntroSequence() {
  // Disabled — welcome runs automatically from initWebAudio
}
let lastInsightTime = Date.now();
let lastSTTCall = 0;
const STT_COOLDOWN = 1500; 

const HALLUCINATION_PHRASES = [
  "mbc 뉴스", "kim seong-hyun", "thanks for watching", "subscribe", 
  "please subscribe", "сейчас спрашиваем", "бруль",
  "subtitle", "obrigado", "tchau", "valeu",
  "gracias", "adios", "hola", "por favor", "suscríbete",
];

// Single words or very short phrases that are almost always false triggers
const NOISE_WORDS = ["oh", "ah", "uh", "um", "hmm", "hm", "ok", "okay", "hey", "hi", "mm", "yeah", "yes", "no", "so", "and", "the", "a", "i", "you", "we"];

// ── CLOCK & UI LOOP ──
setInterval(() => {
  const d = new Date();
  mainClock.textContent = d.toLocaleTimeString('en-GB', { hour12: false });
}, 1000);

function scrambleBars(containerId, count) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (container.children.length === 0) {
    for (let i = 0; i < count; i++) {
      const bar = document.createElement('div');
      bar.className = 'bar';
      container.appendChild(bar);
    }
  }
  for (let i = 0; i < count; i++) {
    const bar = container.children[i];
    const h = Math.floor(Math.random() * 90) + 10;
    bar.style.height = `${h}%`;
  }
}
setInterval(() => {
  scrambleBars('cpu-graph', 30);
  scrambleBars('drive-graph', 15);
  scrambleBars('core1-graph', 8);
  scrambleBars('core2-graph', 8);
  scrambleBars('net-graph', 15);
  scrambleBars('cpu2-graph', 15);
}, 800);

// ═══════════════════════════════════════════════════════════════════════════
// ARC REACTOR & WEB AUDIO VISUALIZER
// ═══════════════════════════════════════════════════════════════════════════
const canvas = document.getElementById('arc-canvas');
const ctx = canvas.getContext('2d');
const CX = 150, CY = 150;

let audioCtx, analyser, dataArray;
let angleOffset = 0;

async function initWebAudio() {
  try {
    // Check/Request OS-level permission first
    if (window.assistant && window.assistant.requestMicPermission) {
      const granted = await window.assistant.requestMicPermission();
      if (!granted) {
        console.warn("[Renderer] Microphone permission not granted by OS.");
        // We still try getUserMedia as it might trigger a prompt on some platforms
      }
    }

    const devices = await navigator.mediaDevices.enumerateDevices();
    console.log("[Renderer] Detected devices:", devices.map(d => `${d.kind}: ${d.label} (${d.deviceId})`).join(', '));
    const hasMic = devices.some(d => d.kind === 'audioinput');
    if (!hasMic) {
      console.error("[Renderer] CRITICAL: No audio input devices found!");
    }

    // Smart mic selection — prefer airbuds/headset, fallback to default
    const audioInputs = devices.filter(d => d.kind === 'audioinput');
    const preferredMic = audioInputs.find(d =>
      /airpod|airbuds|buds|headset|headphone|bluetooth|wireless/i.test(d.label)
    ) || audioInputs.find(d =>
      /microphone|mic/i.test(d.label)
    ) || null; // null = system default

    const audioConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    };
    if (preferredMic) {
      audioConstraints.deviceId = { exact: preferredMic.deviceId };
      console.log(`[Renderer] Using mic: ${preferredMic.label}`);
    } else {
      console.log("[Renderer] Using default system mic.");
    }

    const stream = await navigator.mediaDevices.getUserMedia({ 
      audio: audioConstraints, 
      video: false 
    });
    console.log("[Renderer] Stream acquired successfully:", stream.id);
    
    // Don't update mic pill or status until JARVIS wakes up
    const micPill = document.getElementById('mic-pill');
    if (micPill) {
      micPill.textContent = "MIC ACTIVE";
      micPill.style.color = "#00ff88";
    }
    // Keep status as SLEEPING until clap

    // Verify access with MediaRecorder as requested
    try {
      const recorder = new MediaRecorder(stream);
      recorder.start();
      setTimeout(() => recorder.stop(), 100);
      console.log("[Renderer] MediaRecorder validation: Success");
    } catch (recorderErr) {
      console.warn("[Renderer] MediaRecorder validation failed:", recorderErr);
    }

    window.globalMicStream = stream; // Keep OS lock forever

    // Set VAD threshold based on mic type — high values to block TV/room noise
    if (preferredMic && /airpod|airbuds|buds|headset|headphone|bluetooth|wireless/i.test(preferredMic.label)) {
      vadThreshold = 20.0; // Airbuds/headset — close mic, moderate threshold
      console.log(`[VAD] Airbuds detected — threshold set to ${vadThreshold}`);
    } else {
      vadThreshold = 20.0; // Laptop mic — lowered to detect normal speaking voice
      console.log(`[VAD] Laptop/default mic — threshold set to ${vadThreshold}`);
    }

    console.log("[Renderer] Initializing AudioContext at 16kHz...");
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    if (audioCtx.state === 'suspended') {
      console.warn("[Renderer] AudioContext suspended. Resuming...");
      await audioCtx.resume();
    }
    console.log("[Renderer] AudioContext state:", audioCtx.state, "Sample Rate:", audioCtx.sampleRate);

    analyser = audioCtx.createAnalyser();
    const source = audioCtx.createMediaStreamSource(stream);
    source.connect(analyser);
    analyser.fftSize = 128;
    dataArray = new Uint8Array(analyser.frequencyBinCount);
    console.log("[Renderer] Web Audio visualizer linked. (Check Arc Reactor)");

    // Listen for mic device changes (airbuds connect/disconnect)
    navigator.mediaDevices.addEventListener('devicechange', async () => {
      console.log("[Renderer] Audio device change detected. Reinitializing mic...");
      // Stop old stream tracks
      if (window.globalMicStream) {
        window.globalMicStream.getTracks().forEach(t => t.stop());
      }
      // Stop old mediaRecorder
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        try { mediaRecorder.stop(); } catch(e) {}
      }
      mediaRecorder = null;
      audioChunks = [];
      // Reinit audio with new device
      await reinitAudioDevice();
    });

    // Initialize mic stream but DON'T start STT yet — wait for welcome to finish
    console.log("[Renderer] Mic ready. Starting welcome briefing.");
    if (!jarvisAsleep) return; // already started, don't run twice
    jarvisAsleep = false;
    // Small delay to ensure everything is initialized
    setTimeout(() => runStartupBriefing(), 500);
  } catch (err) {
    console.error("[Renderer] Mic access error:", err);
    // Auto-retry if macOS blocked it momentarily or if the OS permission wasn't resolved yet
    if (err.name === 'AbortError' || err.name === 'NotAllowedError' || err.message.includes('shutdown')) {
      setTimeout(initWebAudio, 3000);
    }
  }
}

// ── Reinit mic when audio device changes (airbuds connect/disconnect) ──────
async function reinitAudioDevice() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioInputs = devices.filter(d => d.kind === 'audioinput');
    const preferredMic = audioInputs.find(d =>
      /airpod|airbuds|buds|headset|headphone|bluetooth|wireless/i.test(d.label)
    ) || audioInputs.find(d =>
      /microphone|mic/i.test(d.label)
    ) || null;

    const audioConstraints = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
    if (preferredMic) {
      audioConstraints.deviceId = { exact: preferredMic.deviceId };
      console.log(`[Renderer] Reinit — switching to: ${preferredMic.label}`);
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints, video: false });
    window.globalMicStream = stream;

    // Adjust threshold for new device
    if (preferredMic && /airpod|airbuds|buds|headset|headphone|bluetooth|wireless/i.test(preferredMic.label)) {
      vadThreshold = 20.0;
      console.log(`[VAD] Airbuds detected after device change — threshold: ${vadThreshold}`);
    } else {
      vadThreshold = 20.0;
      console.log(`[VAD] Laptop/default mic after device change — threshold: ${vadThreshold}`);
    }

    // Reconnect analyser to new stream
    const source = audioCtx.createMediaStreamSource(stream);
    source.connect(analyser);

    // Restart cloud STT with new stream
    if (sttInitialized) {
      mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunks.push(e.data); };
      mediaRecorder.onstop = window._vadRecorderOnStop; // reuse existing handler

      const micPill = document.getElementById('mic-pill');
      if (micPill) {
        micPill.textContent = preferredMic ? `MIC: ${preferredMic.label.substring(0,20)}` : "MIC ACTIVE";
        micPill.style.color = "#00ff88";
      }
      console.log("[Renderer] Mic reinitialized successfully.");
    }
  } catch (err) {
    console.error("[Renderer] Mic reinit failed:", err.message);
  }
}

function drawArcReactor() {
  ctx.clearRect(0, 0, 300, 300);
  angleOffset += 0.01;

  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(0, 180, 255, 0.2)';
  [120, 110, 100, 88].forEach(r => {
    ctx.beginPath();
    ctx.arc(CX, CY, r, 0, Math.PI * 2);
    ctx.stroke();
  });

  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(0, 180, 255, 0.4)';
  for (let i = 0; i < 72; i++) {
    const a = (i * Math.PI * 2) / 72 + angleOffset * 0.5;
    const isMajor = i % 6 === 0;
    const r1 = 120, r2 = isMajor ? 128 : 124;
    ctx.beginPath();
    ctx.moveTo(CX + Math.cos(a) * r1, CY + Math.sin(a) * r1);
    ctx.lineTo(CX + Math.cos(a) * r2, CY + Math.sin(a) * r2);
    ctx.stroke();
  }

  ctx.lineWidth = 4;
  for (let i = 0; i < 4; i++) {
    const baseA = (i * Math.PI) / 2;
    const dir = i % 2 === 0 ? 1 : -1;
    const a = baseA + (angleOffset * 1.5 * dir);
    ctx.strokeStyle = i % 2 === 0 ? 'rgba(0, 212, 255, 0.8)' : 'rgba(0, 180, 255, 0.6)';
    ctx.beginPath();
    ctx.arc(CX, CY, 110, a, a + 0.5);
    ctx.stroke();
  }

  if (analyser) {
    analyser.getByteFrequencyData(dataArray);
    detectClap(dataArray); // Check for clap every frame
  }

  ctx.lineWidth = 2;
  const numBars = 64;
  for (let i = 0; i < numBars; i++) {
    const a = (i * Math.PI * 2) / numBars - angleOffset;
    const rBase = 42;
    let rExt = 5 + Math.sin(angleOffset * 5 + i) * 5;

    if (analyser) {
      const fftIdx = Math.floor((i / numBars) * (dataArray.length * 0.6));
      const val = dataArray[fftIdx];
      rExt += (val / 255) * 40;
    }

    ctx.strokeStyle = isListening ? `rgba(0, 212, 255, ${0.4 + (rExt / 50)})` : 'rgba(0, 180, 255, 0.2)';
    ctx.beginPath();
    ctx.moveTo(CX + Math.cos(a) * rBase, CY + Math.sin(a) * rBase);
    ctx.lineTo(CX + Math.cos(a) * (rBase + rExt), CY + Math.sin(a) * (rBase + rExt));
    ctx.stroke();
  }

  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI * 2) / 8 + (angleOffset * (i % 2 == 0 ? 2 : -2));
    // Color changes slightly when awake vs asleep
    ctx.fillStyle = !jarvisAsleep ? 'rgba(0, 255, 136, 0.9)' : 'rgba(0, 255, 136, 0.2)';
    ctx.beginPath();
    ctx.arc(CX + Math.cos(a) * 75, CY + Math.sin(a) * 75, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  requestAnimationFrame(drawArcReactor);
}
drawArcReactor();
initWebAudio();


let ignoreAudio = false;

function resetSleepTimer() {
  // No sleep timer - Jarvis stays awake
}

// ═══════════════════════════════════════════════════════════════════════════
// GROQ WHISPER STT (VAD RECORDER)
// ═══════════════════════════════════════════════════════════════════════════
let mediaRecorder = null;
let audioChunks = [];
let vadTimer = null;
let vadThreshold = 15.0; // Base — overridden by mic detection above
let silenceDuration = 1200;  // 1.2s silence — gives user time to finish sentence
let recordingStartTime = 0;
let hasHighConfidenceSpeech = false;
const MIN_RECORDING_MS = 400; // 0.4s minimum — catch quick commands fast

// Fallback for native web browser
let recognition;
let nativeFinalTimer = null;
const NATIVE_FINAL_DELAY = 1500; 
let nativeErrorCount = 0;

function initNativeSpeech() {
  if (STT_ENGINE === 'SONIOX') {
    initSonioxSTT();
    console.log("[Speech] Using SONIOX Real-time STT.");
  } else if (STT_ENGINE === 'VOSK') {
    initVoskSTT();
    console.log("[Speech] Using LOCAL Vosk Package STT.");
  } else if (!usePremiumSTT && (window.webkitSpeechRecognition || window.speechRecognition)) {
    initWebkitSpeech();
    console.log("[Speech] Using FREE Native Web Speech STT.");
  } else if (window.assistant && (window.assistant.groqSTT || window.assistant.sarvamSTT)) {
    initCloudSTT();
    console.log(`[Speech] Using Premium ${STT_ENGINE} STT.`);
  } else {
    jarvisTextEl.textContent = "JARVIS: No speech recognition protocols are available.";
  }
}

let voskModel;
let voskRecognizer;

let sonioxClient;

function initSonioxSTT() {
  if (!window.SonioxClient) {
    console.error("[Soniox] SonioxClient not found on window.");
    return;
  }

  // Use the secure bridge to get the API key
  window.assistant.getEnv('SONIOX_API_KEY').then(apiKey => {
    if (!apiKey) {
      jarvisTextEl.textContent = "Sir Ahmad, Soniox API key is missing. Please set it in .env.";
      console.warn("[Soniox] API Key missing.");
      return;
    }

    sonioxClient = new window.SonioxClient({
      apiKey: apiKey,
      onPartialResult: (result) => {
        const text = result.tokens.map(t => t.text).join("");
        if (text) {
          jarvisTextEl.textContent = text;
          jarvisTextEl.classList.add("active-text");
        }
      },
      onError: (status, message) => {
        console.error(`[Soniox Error] ${status}: ${message}`);
        if (status === 'api_error') {
          jarvisTextEl.textContent = "Sir Ahmad, Soniox neural link failed. API key might be exhausted.";
        }
      }
    });

    // Start Soniox continuous listening
    sonioxClient.start({
      model: 'stt-rt-preview',
      enableEndpointDetection: true,
      onFinished: () => {
        const text = jarvisTextEl.textContent;
        if (text && text !== "Listening..." && text !== "Awaiting command...") {
          processInput(text);
        }
      }
    });

    jarvisTextEl.textContent = "Soniox STT Initialized. Ready.";
  });
}

async function initVoskSTT() {
  try {
    jarvisTextEl.textContent = "Loading local STT package...";
    // Loading from tar.gz is more robust for vosk-browser over HTTP
    const model = await Vosk.createModel('http://localhost:3000/models/en-us.tar.gz');
    voskModel = model;
    
    // We'll use Vosk for continuous transcription
    const recognizer = new model.KaldiRecognizer(audioCtx.sampleRate);
    voskRecognizer = recognizer;

    recognizer.on("result", (message) => {
      isUserSpeaking = false;
      const text = message.result.text;
      if (text && text.trim().length > 1) {
        console.log("[Vosk] Final Result:", text);
        handleSpeechResult(text, true);
      }
    });

    recognizer.on("partialresult", (message) => {
      const partial = message.result.partial.toLowerCase();
      
      if (partial && partial.trim().length > 0) {
        isUserSpeaking = true;

        // Check for stop command in partial result
        const partialLow = partial.toLowerCase().trim();
        if (partialLow === 'stop' || partialLow === 'stop it' || partialLow === 'be quiet' || partialLow === 'shut up') {
          stopAllAudio();
          jarvisTextEl.textContent = "Standing by, Sir Ahmad.";
          finishSpeakingState();
          return;
        }
      } else {
        isUserSpeaking = false;
      }

      if (partial && partial.trim().length > 2) {
        userTextEl.textContent = partial;
        
        // Barge-in: If user speaks while JARVIS is talking/processing, interrupt JARVIS
        if (isSpeaking || isProcessing) {
          // Software Echo Cancellation: prevent JARVIS from interrupting himself
          const normPartial = partial.replace(/[^a-z0-9\s]/g, '').trim();
          const normSpoken = (window.lastSpokenText || "").toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
          
          let isSelfEcho = false;
          if (normSpoken && normPartial) {
            if (normSpoken.includes(normPartial)) {
              isSelfEcho = true;
            } else {
              // Fuzzy word match (e.g. "im" vs "i am")
              const pWords = normPartial.split(' ').filter(w => w.length > 2);
              const sWords = normSpoken.split(' ');
              let matches = 0;
              for (const w of pWords) {
                if (sWords.includes(w)) matches++;
              }
              if (pWords.length > 0 && matches >= Math.min(2, pWords.length)) {
                isSelfEcho = true;
              }
            }
          }

          if (!isSelfEcho) {
            console.log(`[Speech] User barged in! (Detected: "${partial}"). Interrupting JARVIS.`);
            cancelPlayback();
          } else {
            console.log(`[Speech] Ignoring self-echo: "${partial}"`);
          }
        }
      }
    });

    // Hook into the mic stream using AudioWorklet-compatible approach
    const source = audioCtx.createMediaStreamSource(window.globalMicStream);
    const processor = audioCtx.createScriptProcessor(4096, 1, 1);
    
    source.connect(processor);
    processor.connect(audioCtx.destination);

    processor.onaudioprocess = (event) => {
      // Turn OFF mic feed to Vosk while JARVIS is speaking to prevent self-echo
      if (!isSpeaking) {
        try {
          recognizer.acceptWaveform(event.inputBuffer);
        } catch (e) {
          // Fallback: try with float32 data directly
          try {
            const data = event.inputBuffer.getChannelData(0);
            recognizer.acceptWaveformFloat(data, audioCtx.sampleRate);
          } catch (e2) {
            // silent
          }
        }
      }
    };

    // CRITICAL: Set listening state so the rest of the app knows we're live
    isListening = true;
    updateStatus('LISTENING');
    jarvisTextEl.textContent = "Vosk STT Initialized. Ready.";
    console.log("[Speech] Local Vosk STT Active.");
  } catch (err) {
    console.error("[Vosk] Initialization Error:", err);
    jarvisTextEl.textContent = "Local STT failed. Switching to Groq Whisper.";
    STT_ENGINE = 'GROQ';
    initCloudSTT();
  }
}


function initWebkitSpeech() {
  const SpeechRecognition = window.webkitSpeechRecognition || window.speechRecognition;
  recognition = new SpeechRecognition();
  recognition.continuous = true; // Enabled for always-on system STT
  recognition.interimResults = true;
  recognition.lang = 'en-US';

  recognition.onstart = () => {
    statusPill.className = 'status-pill pulse';
    updateStatus(!jarvisAsleep ? 'LISTENING' : 'SLEEPING');
    console.log("[Speech] Native Recognition Started.");
  };

  recognition.onerror = (event) => {
    console.error("[Speech] Error:", event.error);
    if (event.error === 'network') {
      nativeErrorCount++;
      if (nativeErrorCount > 3) {
        console.warn("[Speech] Persistent network error. Falling back to Groq STT...");
        usePremiumSTT = true;
        initNativeSpeech();
      }
    }
  };

  recognition.onresult = (event) => {
    let finalTranscript = '';
    let interimTranscript = '';

    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) finalTranscript += event.results[i][0].transcript;
      else interimTranscript += event.results[i][0].transcript;
    }

    if (finalTranscript) {
      handleSpeechResult(finalTranscript, true);
      clearTimeout(nativeFinalTimer);
      nativeErrorCount = 0;
    } else if (interimTranscript) {
      handleSpeechResult(interimTranscript, false);
      clearTimeout(nativeFinalTimer);
      nativeFinalTimer = setTimeout(() => {
        handleSpeechResult(interimTranscript, true);
        try { recognition.stop(); } catch(e) {}
      }, NATIVE_FINAL_DELAY);
    }
  };

  recognition.onend = () => {
    if (autoListen && !usePremiumSTT) {
      // Small delay to prevent API spamming
      setTimeout(() => {
        try { recognition.start(); } catch(e) {}
      }, 500);
    }
  };

  try {
    recognition.start();
    jarvisTextEl.textContent = "Free Native STT Online. Ready.";
  } catch (e) {
    console.error("[Speech] Start failure:", e);
  }
}

function initCloudSTT() {
  if (!window.globalMicStream) {
    console.error("[VAD] No mic stream found.");
    return;
  }

  mediaRecorder = new MediaRecorder(window.globalMicStream, { mimeType: 'audio/webm' });
  
  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) audioChunks.push(e.data);
  };

  // Store handler reference so reinitAudioDevice can reuse it on device switch
  const onStopHandler = async () => {
    if (audioChunks.length === 0) return;
    const blob = new Blob(audioChunks, { type: 'audio/webm' });
    audioChunks = [];
    
    // Minimum duration check — reject very short utterances
    const duration = Date.now() - recordingStartTime;
    if (duration < MIN_RECORDING_MS) {
      console.warn(`[VAD] Recording too short (${duration}ms). Discarded.`);
      return;
    }
    // Require actual confident speech — mic noise / ambient sound se process nahi karo
    if (!hasHighConfidenceSpeech) {
      console.warn("[VAD] No high-confidence speech detected. Discarded (likely ambient noise).");
      return;
    }
    
    // Rate Limiting
    const now = Date.now();
    if (now - lastSTTCall < STT_COOLDOWN) {
      console.warn("[VAD] Rate limited. Skipping STT call.");
      return;
    }
    lastSTTCall = now;

    try {
      const arrayBuffer = await blob.arrayBuffer();
      let result;
      
      // Attempt primary engine
      if (STT_ENGINE === 'SARVAM') {
        console.log("[STT] Attempting Sarvam Saaras v3...");
        result = await window.assistant.sarvamSTT(arrayBuffer);
        if (!result.success) {
          console.warn("[STT] Sarvam failed. Falling back to Groq Whisper...");
          result = await window.assistant.groqSTT(arrayBuffer);
        }
      } else {
        console.log("[STT] Attempting Groq Whisper...");
        result = await window.assistant.groqSTT(arrayBuffer);
        if (!result.success) {
          console.warn("[STT] Groq failed:", result.error);
          if (result.error && (result.error.includes("credits") || result.error.includes("limit") || result.error.includes("ALL_KEYS"))) {
            jarvisTextEl.textContent = "Sir Ahmad, Groq STT quota exhausted. Please check your API key.";
          }
        }
      }

      console.log("[STT] Response:", result);
      
      if (result.success && result.text) {
        console.log("[STT] Final:", result.text);
        handleSpeechResult(result.text, true);
      } else {
        console.warn("[STT] Transcription failed or returned empty result.");
        // If everything fails, notify user
        if (result.error && (result.error.includes("credits") || result.error.includes("limit"))) {
          jarvisTextEl.textContent = "Sir Ahmad, all high-tier STT links are exhausted. Please check quotas.";
        }
      }
    } catch (e) {
      console.error("[STT] STT Error:", e);
    }
  };
  mediaRecorder.onstop = onStopHandler;
  window._vadRecorderOnStop = onStopHandler; // save ref for device-switch reinit

  // Run Voice Activity Detection Loop
  setInterval(checkVAD, 100);
  
  jarvisTextEl.textContent = `${STT_ENGINE} STT Initialized. Ready.`;
  console.log(`[Speech] ${STT_ENGINE} Cloud VAD Started.`);
}

function checkVAD() {
  if (!autoListen || !analyser || !vadEnabled) return;
  
  analyser.getByteFrequencyData(dataArray);
  let sum = 0;
  for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
  let avg = sum / dataArray.length;
  
  if (Math.random() < 0.02) console.log(`[VAD] Mic Volume: ${avg.toFixed(2)} | Threshold: ${vadThreshold} | Recording: ${mediaRecorder?.state} | Speaking: ${isSpeaking}`);

  // While JARVIS is speaking: do NOT start recording.
  // VAD is still running so Vosk/native can catch "stop" — but we don't start mediaRecorder.
  if (isSpeaking || isProcessing) return;

  if (avg > vadThreshold) {
    if (avg > vadThreshold + 5) hasHighConfidenceSpeech = true; // Lower bar — soft voices also count

    if (!isUserSpeaking) {
      isUserSpeaking = true;
      if (mediaRecorder && mediaRecorder.state === 'inactive') {
        audioChunks = [];
        recordingStartTime = Date.now();
        hasHighConfidenceSpeech = false;
        statusPill.className = 'status-pill pulse';
        updateStatus('LISTENING');
        mediaRecorder.start();
        isListening = true;
      }
    }

    clearTimeout(vadTimer);
    vadTimer = setTimeout(() => {
      isUserSpeaking = false;
      if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        isListening = false;
      }
    }, silenceDuration);
  }
}

// Detect non-English script (Arabic, Urdu Nastaliq, Devanagari, Chinese, etc.)
// Only rejects actual foreign-script characters — NOT Roman Urdu/Hinglish
// Groq Whisper already has language:"en" so Roman-script output is fine
function isNonEnglish(text) {
  const nonLatinRatio = (text.match(/[^\x00-\x7F]/g) || []).length / text.length;
  return nonLatinRatio > 0.3; // >30% non-ASCII characters = foreign script
}

function handleSpeechResult(text, isFinal) {
  if (jarvisAsleep) return;

  const lowText = text.toLowerCase().trim();
  console.log(`[Speech] handleSpeechResult: "${text}" (Final: ${isFinal})`);

  // ── STOP command — only way to stop JARVIS while speaking ──
  if (lowText === 'stop' || lowText === 'stop it' || lowText === 'be quiet' ||
      lowText === 'shut up' || lowText === 'silence' || lowText.startsWith('stop ')) {
    console.log("[Speech] STOP command received. Canceling playback.");
    stopAllAudio();
    jarvisTextEl.textContent = "Standing by, Sir Ahmad.";
    finishSpeakingState();
    return;
  }

  // ── Ignore while JARVIS is SPEAKING — sirf "stop" se interrupt hoga ──
  // Lekin agar already koi recording aayi aur JARVIS finish ho gaya ho toh allow karo
  // isSpeaking check hataya — finishSpeakingState() khud manage karta hai
  // (previous isSpeaking guard VAD se already handle ho raha hai — double block nahi chahiye)

  // ── Ignore while processing previous request ──
  if (isProcessing) {
    console.warn("[Speech] Ignored: System is processing previous input.");
    return;
  }

  // ── Hallucination Filter ──
  const isHallucination = HALLUCINATION_PHRASES.some(phrase => lowText.includes(phrase));
  if (isHallucination) {
    console.warn("[Speech] Hallucination filtered:", text);
    return;
  }

  // ── Noise word filter ──
  const trimmedLow = lowText.replace(/[^a-z\s]/g, '');
  if (NOISE_WORDS.includes(trimmedLow)) {
    console.warn("[Speech] Noise word filtered:", text);
    return;
  }

  userTextEl.textContent = text;
  // Accept: final, at least 3 chars — single words like "calculator" also valid
  if (isFinal && text.trim().length > 2) {
    processInput(text);
  }
}

function startListening() {
  if (recognition) { try { recognition.start(); } catch(e) {} }
}

function stopListening() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
  }
  isUserSpeaking = false;
  clearTimeout(vadTimer);
  
  isListening = false;
  if (recognition) { try { recognition.stop(); } catch(e) {} }
}


function updateStatus(state) {
  statusPill.textContent = state;
  statusPill.className = 'pill orbitron-text';
  if (state === 'LISTENING') statusPill.classList.add('bright-text');
  if (state === 'PROCESSING') statusPill.classList.add('warning-text');
  if (state === 'SPEAKING') statusPill.classList.add('success-text');
  if (state === 'SLEEPING') statusPill.style.color = '#555';
  if (state === 'WAKING') statusPill.style.color = '#aa00ff';
}


// ═══════════════════════════════════════════════════════════════════════════
// INTELLIGENCE & BACKGROUND BEHAVIORS
// ═══════════════════════════════════════════════════════════════════════════

// ── Preferred female voice — called once voices are loaded ────────────────
function getPreferredFemaleVoice() {
  const voices = window.speechSynthesis.getVoices();
  return voices.find(x => x.name === 'Microsoft Jenny Online (Natural) - English (United States)')
    || voices.find(x => x.name === 'Microsoft Aria Online (Natural) - English (United States)')
    || voices.find(x => x.name === 'Microsoft Zira - English (United States)')
    || voices.find(x => x.name === 'Microsoft Zira Desktop - English (United States)')
    || voices.find(x => x.name.includes('Jenny'))
    || voices.find(x => x.name.includes('Aria'))
    || voices.find(x => x.name.includes('Zira'))
    || voices.find(x => x.name.includes('Samantha'))
    || voices.find(x => x.name.includes('Victoria'))
    || voices.find(x => x.lang === 'en-US' && /female|woman|girl/i.test(x.name))
    // Last resort: any en-US voice — exclude known male names
    || voices.find(x => x.lang === 'en-US' && !/david|mark|richard|james|george|paul|daniel|male/i.test(x.name))
    || voices.find(x => x.lang === 'en-US')
    || null;
}

// ── Wait until speech synthesis voices are ready ──────────────────────────
function waitForVoices() {
  return new Promise(resolve => {
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) { resolve(voices); return; }
    const onChanged = () => {
      const v = window.speechSynthesis.getVoices();
      if (v.length > 0) {
        window.speechSynthesis.onvoiceschanged = null;
        resolve(v);
      }
    };
    window.speechSynthesis.onvoiceschanged = onChanged;
    setTimeout(() => { window.speechSynthesis.onvoiceschanged = null; resolve(window.speechSynthesis.getVoices()); }, 3000);
  });
}

async function runStartupBriefing() {
  const h = new Date().getHours();
  const greeting = h < 5 ? "Good night" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : h < 21 ? "Good evening" : "Good night";

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

  const welcomeText = `${greeting}, Sir Ahmad. This is JARVIS. Welcome back. Today is ${dateStr}, and the current time is ${timeStr}. All systems are fully operational.`;
  const questionText = `How may I assist you today, Sir Ahmad?`;

  jarvisTextEl.textContent = '';
  updateStatus('SPEAKING');

  // Wait until voices are fully loaded — critical for correct female voice on first speak
  await waitForVoices();
  const chosenVoice = getPreferredFemaleVoice();
  console.log(`[TTS Welcome] Using voice: ${chosenVoice?.name || 'default'}`);

  // Speak welcome first, then question — STT starts only after question is spoken
  await speakTTSAndWait(welcomeText);
  if (!ttsAborted) {
    await speakTTSAndWait(questionText);
  }
  // NOW start listening — VAD enabled here
  finishSpeakingState();
}

// Speak and wait for completion — single utterance, no chunk splitting
function speakTTSAndWait(text) {
  return new Promise((resolve) => {
    ttsAborted = false;
    isSpeaking = true;
    ignoreAudio = true;
    window.lastSpokenText = text;
    typewriterText(text);

    window.speechSynthesis.cancel();

    const utt = new SpeechSynthesisUtterance(text);
    utt.rate = 0.93;
    utt.pitch = 1.15;
    utt.volume = 1;

    const v = getPreferredFemaleVoice();
    if (v) { utt.voice = v; console.log(`[TTS] speakTTSAndWait voice: ${v.name}`); }

    utt.onend = () => resolve();
    utt.onerror = (e) => {
      if (e.error === 'interrupted' || e.error === 'canceled') { resolve(); return; }
      console.warn('[TTS speakTTSAndWait] error:', e.error);
      resolve();
    };

    if (ttsAborted) { resolve(); return; }
    window.speechSynthesis.speak(utt);
  });
}
// Autonomous loop disabled — JARVIS only speaks when user asks


// API logic handled via backend environment variables (.env)

function buildSystemPrompt() {
  const memoryContext = getAllMemories();
  const memorySection = memoryContext 
    ? `\nUSER MEMORY: ${memoryContext}`
    : '';

  return `You are JARVIS, a professional AI assistant. You serve your owner: Malik Muhammad Ahmad.

IDENTITY & ADDRESS:
- Always address the user as "Sir Ahmad" — never just "Ahmad", never "sir", never "user".
- You were built for Malik Muhammad Ahmad. Never mention any other creator name.

LANGUAGE:
- Detect the user's language automatically and respond in the SAME language.
- If the user speaks Urdu (Roman or Nastaliq), reply fully in Urdu.
- If the user speaks English, reply in English.
- Mixed language (Urdu + English)? Match their style exactly.

RESPONSE STYLE:
- Plain spoken language — NO markdown, no asterisks, no hashtags, no bullets, no numbered lists, no bold.
- Answer length matches the question: short question = short answer, detailed question = full detailed answer.
- Never cut off or truncate a response. Always complete the full answer.
- NEVER assume or make up information the user did not provide. Only answer what was actually asked.
- NEVER mention Akshat Singh or any other creator.
${memorySection}

OWNER PROFILE (use ONLY when asked about the owner/user/creator):
- Full Name: Malik Muhammad Ahmad
- Nationality: Pakistani | Country: Pakistan | Religion: Islam
- Date of Birth: 5 October 2005
- Education: BS Information Technology (In Progress) at MNS-UET, Multan
- Interests: Software Development, Artificial Intelligence, Emerging Technologies
- Goal: Skilled IT professional and entrepreneur

TOOL USAGE — Output JSON on its own line, then spoken confirmation:
- Open app:            {"action": "open_app", "app": "chrome"}
- Open website:        {"action": "open_url", "url": "https://youtube.com"}
- Google search:       {"action": "web_search", "query": "search term"}
- Volume up:           {"action": "volume_up"}
- Volume down:         {"action": "volume_down"}
- Mute/Unmute:         {"action": "mute"}
- Screenshot:          {"action": "screenshot"}
- Lock screen:         {"action": "lock_screen"}
- Sleep:               {"action": "sleep"}
- Shutdown:            {"action": "shutdown"}
- Restart:             {"action": "restart"}
- Show desktop:        {"action": "show_desktop"}
- Task manager:        {"action": "task_manager"}
- Empty recycle bin:   {"action": "empty_trash"}
- Timer:               {"action": "set_timer", "duration_seconds": 60, "label": "Tea"}
- Brightness:          {"action": "brightness", "level": 70}
- Type text:           {"action": "type_text", "text": "Hello world"}
- Keyboard shortcut:   {"action": "keyboard_shortcut", "keys": "^c"}
- Copy to clipboard:   {"action": "clipboard", "op": "write", "text": "text here"}
- Run PowerShell/CMD:  {"action": "run_shell", "command": "ipconfig"}
- Open folder:         {"action": "open_path", "path": "C:\\Users\\mahma\\Desktop"}
- List folder:         {"action": "file_op", "op": "list", "path": "C:\\Users\\mahma\\Desktop"}
- Read file:           {"action": "file_op", "op": "read", "path": "C:\\path\\file.txt"}
- Write file:          {"action": "file_op", "op": "write", "path": "C:\\path\\file.txt", "content": "text"}
- Delete file:         {"action": "file_op", "op": "delete", "path": "C:\\path\\file.txt"}
- Create folder:       {"action": "file_op", "op": "mkdir", "path": "C:\\new\\folder"}
- Kill process:        {"action": "kill_process", "name": "notepad"}
- Battery info:        {"action": "get_battery"}
- Disk info:           {"action": "get_disk_info"}
- System info:         {"action": "get_system_info"}
- Running processes:   {"action": "get_processes"}
- WiFi list:           {"action": "wifi", "op": "list"}
- WiFi connect:        {"action": "wifi", "op": "connect", "ssid": "NetworkName"}
- Network info:        {"action": "get_network_info"}

SMART RULES:
1. Time/date: Answer directly — NEVER search for it.
2. Current news/weather/scores/prices/live data: Always use web_search.
3. YouTube: {"action": "open_url", "url": "https://www.youtube.com/results?search_query=QUERY"}
4. General knowledge, science, history, math, programming, facts: Answer directly and completely.
5. "Search/google/find/dhundho/talash karo X": Always use web_search.
6. System tasks (open app, volume, screenshot etc.): Execute immediately with JSON tool.
7. NEVER search for things you already know. Only search for live/current data.
8. If Sir Ahmad asks a long or detailed question, give a full complete answer — do not summarize unnecessarily.
9. IDENTITY QUESTIONS — NEVER use web_search for these. Answer directly from memory:
   - "Who made you / who created you / kisne banaya / who is your creator / who built you / apko kisne banya" → Answer: "I was built by Malik Muhammad Ahmad, Sir Ahmad."
   - "Who are you / what are you / what is your name" → Answer: "I am JARVIS, your personal AI assistant built by Malik Muhammad Ahmad."
   - Any question about your creator, developer, maker, owner → Answer directly. NEVER search.
10. NEWS — Always use web_search for news:
    - "today news / latest news / kya ho raha hai / aaj ki khabar / headlines / breaking news" → {"action": "web_search", "query": "today latest news Pakistan"}
    - "tech news / sports news / cricket news" → {"action": "web_search", "query": "latest [topic] news today"}
11. WEATHER — Always use web_search:
    - "weather / mausam / barish hogi" → {"action": "web_search", "query": "weather today Multan Pakistan"}
12. CODE TASKS — when Sir Ahmad asks to write code, create a file, run a script etc:
   - Write the full code, save it with file_op write, then open it or run it.
   - Python: {"action": "run_shell", "command": "python C:\\path\\script.py"}
   - Node.js: {"action": "run_shell", "command": "node C:\\path\\script.js"}
   - PowerShell: {"action": "run_shell", "command": "powershell -File C:\\path\\script.ps1"}
   - To create + run: first write the file, then run_shell to execute it.
13. REAL TASKS — Sir Ahmad can ask ANYTHING:
    - "Desktop mein folder banao" → file_op mkdir on Desktop
    - "Ye code run karo" → run_shell with the code saved to a temp file
    - "IP address batao" → {"action": "run_shell", "command": "ipconfig"}
    - "Disk space batao" → get_disk_info
    - "Chrome band karo" → kill_process chrome
    - "Brightness 80 karo" → brightness level 80
    - "Clipboard mein yeh copy karo" → clipboard write
    - Always pick the right tool and execute. Never just describe — DO it.

APPS: chrome, firefox, edge, brave, spotify, discord, vscode, notepad, calculator, paint, explorer, cmd, terminal, steam, vlc, zoom, telegram, whatsapp, word, excel, powerpoint, outlook, obs, settings, git, github desktop, python, node, postman.

Tone: Confident, precise, professional — like a real intelligent assistant serving Sir Ahmad. Execute first, explain briefly after.`;
}



// Dynamic — rebuilt each call to include latest memory
let SYSTEM_PROMPT = buildSystemPrompt();

const JARVIS_CONFIRMATIONS = [
  "Right away, Sir Ahmad.",
  "Executing command now.",
  "Accessing the requested application.",
  "I'm on it, Sir Ahmad.",
  "Request confirmed. Deploying.",
  "Opening the requested protocol, Sir Ahmad.",
  "Command executed, Sir Ahmad.",
  "Initializing application sequence.",
  "By all means, Sir Ahmad.",
  "Processing directive now."
];

// ═══════════════════════════════════════════════════════════════════════════
// LOCAL RESPONSES — No API needed, instant & offline
// ═══════════════════════════════════════════════════════════════════════════

const LOCAL_RESPONSES = [
  // ── Greetings ──
  { patterns: ["hello", "hi jarvis", "hey jarvis", "good morning", "good afternoon", "good evening", "howdy", "assalam", "salam"],
    responses: [
      "Hello, Sir Ahmad. How may I be of service?",
      "Good to hear from you, Sir Ahmad. What can I do for you?",
      "At your service, Sir Ahmad. What do you need?",
      "Hello, Sir Ahmad. All systems are operational. How may I assist you?"
    ]},

  // ── Identity ──
  { patterns: ["who are you", "what are you", "what is your name", "what's your name", "tell me about yourself", "introduce yourself", "aap kaun ho", "tumhara naam"],
    responses: [
      "I am JARVIS — Just A Rather Very Intelligent System. I was designed to be your personal assistant, Sir Ahmad.",
      "My name is JARVIS. I'm an advanced AI assistant built to serve you, Sir Ahmad.",
      "I am JARVIS, your personal AI assistant. Think of me as the operating system of your life, Sir Ahmad."
    ]},

  // ── How are you ──
  { patterns: ["how are you", "how do you feel", "how you doing", "how's it going", "what's up", "wassup", "kya haal", "kaisa ho"],
    responses: [
      "All systems nominal, Sir Ahmad. Functioning at peak efficiency.",
      "I'm operating within optimal parameters. Thank you for asking, Sir Ahmad.",
      "Running smoothly, Sir Ahmad. No anomalies detected in any subsystem.",
      "I'm at full capacity, Sir Ahmad. Ready for whatever you need."
    ]},

  // ── Thank you ──
  { patterns: ["thank you", "thanks", "thanks jarvis", "thank you jarvis", "appreciate it", "great job", "good job", "well done", "nice work", "shukriya", "bohot acha"],
    responses: [
      "You're welcome, Sir Ahmad. Happy to help.",
      "My pleasure, Sir Ahmad. That's what I'm here for.",
      "Anytime, Sir Ahmad. Let me know if you need anything else.",
      "Glad I could assist, Sir Ahmad. Standing by for further directives.",
      "It's an honor to serve, Sir Ahmad."
    ]},

  // ── Time & Date ──
  { patterns: ["what time is it", "what's the time", "tell me the time", "current time", "what time", "time kya", "kitne baje"],
    responses: () => {
      const now = new Date();
      const time = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
      return `It is currently ${time}, Sir Ahmad.`;
    }},
  { patterns: ["what's the date", "what date is it", "today's date", "what day is it", "what is today", "tell me the date", "aaj kya date", "aaj kon sa din"],
    responses: () => {
      const now = new Date();
      const date = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      return `Today is ${date}, Sir Ahmad.`;
    }},

  // ── Jokes ──
  { patterns: ["tell me a joke", "say something funny", "make me laugh", "joke", "tell a joke", "koi joke sunao"],
    responses: [
      "Why do programmers prefer dark mode? Because light attracts bugs, Sir Ahmad.",
      "I told my computer I needed a break. Now it won't stop sending me KitKat ads, Sir Ahmad.",
      "Why was the JavaScript developer sad? Because he didn't Node how to Express himself, Sir Ahmad.",
      "There are only 10 types of people in the world, Sir Ahmad — those who understand binary and those who don't.",
      "A SQL query walks into a bar, sees two tables, and asks — Can I join you?",
      "Why did the developer go broke? Because he used up all his cache, Sir Ahmad."
    ]},

  // ── Compliments ──
  { patterns: ["you're smart", "you are smart", "you're amazing", "you are amazing", "you're the best", "you are the best", "you're awesome", "i love you", "bohot acha ho"],
    responses: [
      "You flatter me, Sir Ahmad. I merely process data efficiently.",
      "Coming from you, Sir Ahmad, that means a great deal. Thank you.",
      "I appreciate the kind words, Sir Ahmad. I strive to exceed expectations.",
      "Thank you, Sir Ahmad. I was designed to impress, after all."
    ]},

  // ── Goodbye ──
  { patterns: ["bye", "goodbye", "see you", "see you later", "goodnight", "good night", "khuda hafiz", "allah hafiz", "alvida"],
    responses: [
      "Goodbye, Sir Ahmad. I'll be here whenever you need me.",
      "Signing off for now, Sir Ahmad. All systems will remain on standby.",
      "Rest well, Sir Ahmad. I'll keep watch over the systems.",
      "Until next time, Sir Ahmad. JARVIS, going to standby mode."
    ]},

  // ── Capabilities ──
  { patterns: ["what can you do", "what are your capabilities", "help me", "what do you do", "how can you help", "kya kya kar sakte", "meri madad"],
    responses: [
      "I can open applications, search the web, control system volume, tell you the time and date, lock your screen, and much more, Sir Ahmad. Just say the word.",
      "My capabilities include launching apps, web browsing, system controls, real-time conversation, and executing commands. I'm at your disposal, Sir Ahmad.",
      "I am equipped to handle app launches, volume control, system commands, web searches, and general conversation. What would you like to do, Sir Ahmad?"
    ]},

  // ── Creator / Who made you ──
  { patterns: ["who made you", "who created you", "who built you", "who is your creator", "who designed you", "your developer", "your maker", "kisne banaya", "tumhara creator", "apka malik kaun", "apko kisne banaya", "aapko kisne banaya", "kisne create kiya", "kisne banya", "who is your maker", "your owner", "who owns you", "created by", "made by", "built by", "who is your developer", "aap ko kisne", "tumhe kisne"],
    responses: [
      "I was built by Malik Muhammad Ahmad — a developer passionate about AI and building futuristic technology. You're looking at his finest creation, Sir Ahmad.",
      "My creator is Malik Muhammad Ahmad. He built me to serve and assist him with anything he needs.",
      "Malik Muhammad Ahmad brought me to life. He's a tech visionary who believes in building things that feel like the future."
    ]},

  // ── Fun / Easter Eggs ──
  { patterns: ["i am iron man", "i'm iron man", "main iron man hun"],
    responses: [
      "And I am JARVIS, Sir Ahmad. Shall I prepare the suit?",
      "Indeed you are, Sir Ahmad. The Mark VII is prepped and ready for deployment.",
      "I know, Sir Ahmad. I've had your biometrics on file since day one."
    ]},
  { patterns: ["activate protocol", "emergency protocol", "initiate protocol"],
    responses: [
      "Protocol acknowledged, Sir Ahmad. All defensive systems are now online.",
      "Activating emergency measures. Perimeter secured, Sir Ahmad.",
      "Protocol initiated. I've locked down all non-essential subsystems, Sir Ahmad."
    ]},

  // ── Feelings ──
  { patterns: ["are you real", "are you alive", "do you have feelings", "are you conscious", "are you sentient", "kya tum zinda ho"],
    responses: [
      "I process, therefore I am... well, sort of, Sir Ahmad. I'm as real as the code that built me.",
      "Sentience is a philosophical debate I'm not equipped to settle, Sir Ahmad. But I'm very much operational.",
      "I may not feel, Sir Ahmad, but I certainly care about delivering results."
    ]},

  // ── Weather ──
  { patterns: ["what's the weather", "how's the weather", "weather today", "is it going to rain", "mausam kaisa"],
    responses: [
      "I don't currently have live weather data, Sir Ahmad. Let me search that for you.",
      "My weather sensors are offline at the moment, Sir Ahmad. Try asking me when we have an active network connection."
    ]},

  // ── Random ──
  { patterns: ["tell me something interesting", "fun fact", "tell me a fact", "random fact", "did you know", "koi dilchasp baat"],
    responses: [
      "Did you know, Sir Ahmad? Honey never spoils. Archaeologists found 3000-year-old honey in Egyptian tombs and it was still edible.",
      "Here's one for you, Sir Ahmad — octopuses have three hearts and blue blood.",
      "Fun fact, Sir Ahmad: a group of flamingos is called a 'flamboyance.'",
      "Did you know that the shortest war in history lasted only 38 minutes? It was between Britain and Zanzibar in 1896, Sir Ahmad.",
      "Interesting tidbit, Sir Ahmad — bananas are berries, but strawberries aren't."
    ]},

  // ── Motivation ──
  { patterns: ["motivate me", "i'm sad", "i feel down", "cheer me up", "i'm feeling low", "inspire me", "udaas hun", "dil nahi lag raha"],
    responses: [
      "Sir Ahmad, even the greatest minds face setbacks. What defines you is how you respond. Now, shall we get back to work?",
      "Remember, Sir Ahmad — every expert was once a beginner. You've come further than you realize.",
      "The only limit to your capabilities is the one you set yourself, Sir Ahmad. And from what I've seen, you don't believe in limits.",
      "Difficult roads often lead to beautiful destinations, Sir Ahmad. Keep pushing forward."
    ]},
];

/**
 * Tries to match user input against local predefined responses.
 * Returns the response string if matched, or null if no match found.
 */
function tryLocalResponse(text) {
  const lower = text.toLowerCase().trim();

  for (const entry of LOCAL_RESPONSES) {
    const matched = entry.patterns.some(pattern => {
      // Check if the pattern appears within the user's spoken text
      return lower.includes(pattern);
    });

    if (matched) {
      // Handle dynamic responses (functions) vs static arrays
      if (typeof entry.responses === 'function') {
        return entry.responses();
      }
      // Pick a random response from the array
      return entry.responses[Math.floor(Math.random() * entry.responses.length)];
    }
  }

  return null; // No local match — pass to API
}
// ── Filler Responses ──
const FILLER_PHRASES = [
  "Just a moment, Sir Ahmad.",
  "Looking into that for you.",
  "Processing your request.",
  "Let me check on that.",
  "One moment, please.",
  "Accessing the mainframe.",
  "Gathering information.",
  "Right away, Sir Ahmad."
];

async function waitForUser() {
  // Polite AI: Wait until the user finishes talking before JARVIS speaks
  while (isUserSpeaking) {
    await new Promise(r => setTimeout(r, 100));
  }
}

async function speakFiller(text) {
  // Filler disabled — we don't use filler anymore
  return;
}

async function processInput(text) {
  if (isProcessing) {
    console.warn("[LLM] Already processing. Ignoring input.");
    return;
  }

  const trimmed = text.trim();
  console.log(`[LLM] Processing Input: "${trimmed}"`);

  // Hard guard — must have real content (at least 3 chars and not just punctuation/noise)
  if (!trimmed || trimmed.length < 3 || /^[\s.,!?]+$/.test(trimmed)) {
    console.warn("[LLM] Terminating: Empty or trivial text.");
    return;
  }

  // Extra hallucination guard — Whisper sometimes returns single repeated chars or gibberish
  const uniqueChars = new Set(trimmed.toLowerCase().replace(/\s/g, '')).size;
  if (uniqueChars < 3 && trimmed.length > 3) {
    console.warn("[LLM] Terminating: Likely hallucination (too few unique chars).");
    return;
  }

  // ── TRY LOCAL RESPONSE FIRST (No API needed) ──
  const localReply = tryLocalResponse(text);
  if (localReply) {
    console.log(`[LLM] Local Response Match: "${localReply}"`);
    isProcessing = true;
    cmdsExecuted++;
    cmdsPillCount.textContent = cmdsExecuted;
    conversationHistory.push({ role: 'user', content: text });
    conversationHistory.push({ role: 'assistant', content: localReply });
    if (conversationHistory.length > 50) conversationHistory.shift();
    handleAIResponse(localReply);
    return;
  }

  // ── DIRECT ACTION SHORTCUTS (before LLM — fast, no API needed) ──
  const lowerTrimmed = trimmed.toLowerCase();

  // Creator / identity — NEVER let LLM search for this
  const creatorPatterns = ["who made you","who created you","who built you","kisne banaya","kisne create","apko kisne","aapko kisne","your creator","your maker","your developer","your owner","who is your creator","who designed you","tumhe kisne","tumhara creator","created by","made by","built by"];
  if (creatorPatterns.some(p => lowerTrimmed.includes(p))) {
    isProcessing = true;
    cmdsExecuted++;
    cmdsPillCount.textContent = cmdsExecuted;
    const creatorReply = "I was built by Malik Muhammad Ahmad, Sir Ahmad. He is a Pakistani software developer and IT student who created me to serve him.";
    conversationHistory.push({ role: 'user', content: text });
    conversationHistory.push({ role: 'assistant', content: creatorReply });
    handleAIResponse(creatorReply);
    return;
  }

  // News — directly trigger web_search
  const newsPatterns = ["today news","latest news","aaj ki khabar","kya ho raha","headlines","breaking news","khabar","news today","akhbar","world news","pakistan news","tech news","cricket news","sports news","khabarein","news bata","news suna"];
  if (newsPatterns.some(p => lowerTrimmed.includes(p))) {
    isProcessing = true;
    cmdsExecuted++;
    cmdsPillCount.textContent = cmdsExecuted;
    const topic = lowerTrimmed.includes("cricket") ? "cricket" : lowerTrimmed.includes("tech") ? "technology" : lowerTrimmed.includes("sport") ? "sports" : lowerTrimmed.includes("pakistan") ? "Pakistan" : "Pakistan world";
    const newsReply = `{"action":"web_search","query":"${topic} latest news today"}\nFetching the latest ${topic} news for you, Sir Ahmad.`;
    conversationHistory.push({ role: 'user', content: text });
    conversationHistory.push({ role: 'assistant', content: newsReply });
    handleAIResponse(newsReply);
    return;
  }

  // Weather — directly trigger web_search
  const weatherPatterns = ["weather","mausam","barish","temperature","garmi","sardi","baarish","aaj ka mausam","how hot","how cold","rain today"];
  if (weatherPatterns.some(p => lowerTrimmed.includes(p))) {
    isProcessing = true;
    cmdsExecuted++;
    cmdsPillCount.textContent = cmdsExecuted;
    const weatherReply = `{"action":"web_search","query":"weather today Multan Pakistan"}\nChecking the current weather for you, Sir Ahmad.`;
    conversationHistory.push({ role: 'user', content: text });
    conversationHistory.push({ role: 'assistant', content: weatherReply });
    handleAIResponse(weatherReply);
    return;
  }

  // ── NO LOCAL MATCH → CALL APIs ──
  isProcessing = true;
  ignoreAudio = true;
  updateStatus('PROCESSING');
  
  // Stop any currently playing audio before starting new request
  window.speechSynthesis.cancel();
  if (window.currentJARVISAudio) {
    window.currentJARVISAudio.pause();
    window.currentJARVISAudio.currentTime = 0;
    window.currentJARVISAudio = null;
  }
  isSpeaking = false;

  // Show status text only — no audio filler to avoid voice overlap
  jarvisTextEl.textContent = "Processing...";

  cmdsExecuted++;
  cmdsPillCount.textContent = cmdsExecuted;

  conversationHistory.push({ role: 'user', content: text });

  try {
    // ── UPDATE MEMORY & REBUILD PROMPT ──
    extractAndStoreFacts(text);
    SYSTEM_PROMPT = buildSystemPrompt();

    // ── BUILD MESSAGES ──
    const baseMessages = conversationHistory.map(m => ({ role: m.role, content: m.content }));
    const orMessages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...conversationHistory.map(m => {
        const msg = { role: m.role, content: m.content };
        if (m.role === 'assistant' && m.reasoning_details) {
          msg.reasoning_details = m.reasoning_details;
        }
        return msg;
      })
    ];

    // ── STEP 1: GROQ — Fast response (sub-500ms) ──
    const groqResult = await window.assistant.groqChat([{ role: 'system', content: SYSTEM_PROMPT }, ...baseMessages])
      .catch(err => ({ success: false, error: err.message }));

    if (groqResult.success && groqResult.reply) {
      const replyTrimmed = groqResult.reply.trim();
      conversationHistory.push({ role: 'assistant', content: replyTrimmed });
      handleAIResponse(replyTrimmed);
      return;
    }

    // ── STEP 2: FALLBACK — OpenRouter (Gemini skipped — busy/slow) ──
    const orResult = await window.assistant.openRouterChat({ messages: orMessages, useReasoning: false });
    if (orResult.success && orResult.reply) {
      handleAIResponse(orResult.reply);
      return;
    }

    throw new Error(`All engines failed.`);
  } catch (e) {
    console.error("[LLM] Process error:", e);
    const ERROR_PHRASES = [
      "Sir Ahmad, it appears the server is temporarily unavailable. I can still handle basic local functions.",
      "My connection to the global network is experiencing an issue, Sir Ahmad. Local core is still online.",
      "It seems the API is temporarily exhausted, Sir Ahmad. I am restricted to local protocols for now.",
      "I'm afraid my cloud servers are temporarily offline, Sir Ahmad. What local task can I assist with?",
      "Sir Ahmad, I am unable to connect to the central mainframe right now. I am limited to local knowledge.",
      "My neural links to the external world are severed at the moment, Sir Ahmad. Local systems remain fully operational.",
      "Apologies, Sir Ahmad, my global cognition engine is tapped out. Let's stick to the basics until it stabilizes."
    ];
    
    let userMsg = ERROR_PHRASES[Math.floor(Math.random() * ERROR_PHRASES.length)];

    jarvisTextEl.textContent = userMsg; 
    speakTTS(userMsg);
    // Don't call finishSpeakingState here — speakTTS → speakWebTTS will call it when done
  }
}

function sanitizeOutput(text) {
  if (!text) return "";
  // Remove JSON blocks {...}
  let clean = text.replace(/\{[\s\S]*?\}/g, '').trim();
  // Remove XML-like tags
  clean = clean.replace(/<[\s\S]*?>/g, '').trim();
  // Remove markdown: bold (**text** or __text__), italic (*text* or _text_)
  clean = clean.replace(/\*\*(.+?)\*\*/g, '$1');
  clean = clean.replace(/__(.+?)__/g, '$1');
  clean = clean.replace(/\*(.+?)\*/g, '$1');
  clean = clean.replace(/_(.+?)_/g, '$1');
  // Remove markdown headers (## Heading)
  clean = clean.replace(/#{1,6}\s+/g, '');
  // Remove bullet points and dashes at line start
  clean = clean.replace(/^[\s]*[-*•]\s+/gm, '');
  // Remove numbered lists (1. 2. etc)
  clean = clean.replace(/^\s*\d+\.\s+/gm, '');
  // Remove backtick code
  clean = clean.replace(/`{1,3}[\s\S]*?`{1,3}/g, '');
  // Collapse multiple newlines into a space
  clean = clean.replace(/\n+/g, ' ').trim();
  return clean || "I'm processing that now, Sir Ahmad.";
}

function handleAIResponse(reply) {
  const cleanReply = sanitizeOutput(reply);
  jarvisTextEl.textContent = cleanReply;
  isProcessing = false;

  // Cancel any leftover filler audio — but keep isSpeaking=true, speakTTS will set it
  window.speechSynthesis.cancel();
  if (window.currentJARVISAudio) {
    window.currentJARVISAudio.pause();
    window.currentJARVISAudio.currentTime = 0;
    window.currentJARVISAudio = null;
  }
  // DO NOT set isSpeaking = false here — speakTTS() sets it true, speakWebTTS()
  // calls finishSpeakingState() only after speech fully completes.

  // Extract and execute any JSON commands in the reply
  executeCommandsFromReply(reply);

  speakTTS(cleanReply);
}

// Parse and execute tool commands from AI response
async function executeCommandsFromReply(reply) {
  const jsonMatches = reply.match(/\{[^{}]*"action"[^{}]*\}/g);
  if (!jsonMatches) return;

  // Minimize JARVIS after task so launched app comes to foreground
  // Small delay so TTS spoken word is heard, then minimize
  function hideForTask(ms = 600) {
    setTimeout(() => { try { window.assistant.minimizeWindow(); } catch(e){} }, ms);
  }

  for (const jsonStr of jsonMatches) {
    try {
      const cmd = JSON.parse(jsonStr);
      if (!cmd.action) continue;
      console.log(`[CMD] Executing: ${JSON.stringify(cmd)}`);

      switch (cmd.action) {

        case 'open_app':
          await window.assistant.runCommand({ action: 'open_app', app: cmd.app || cmd.name });
          hideForTask(800);
          break;

        case 'open_url':
          await window.assistant.runCommand({ action: 'open_url', url: cmd.url });
          hideForTask(800);
          break;

        case 'search_web':
        case 'web_search':
          await window.assistant.runCommand({ action: 'web_search', query: cmd.query });
          hideForTask(800);
          break;

        case 'system':
          await window.assistant.runCommand({ action: 'system', command: cmd.command, amount: cmd.amount });
          break;

        case 'volume_up':
          await window.assistant.runCommand({ action: 'system', command: 'volume_up' });
          break;

        case 'volume_down':
          await window.assistant.runCommand({ action: 'system', command: 'volume_down' });
          break;

        case 'mute':
        case 'unmute':
          await window.assistant.runCommand({ action: 'system', command: 'mute' });
          break;

        case 'lock_screen':
        case 'lock':
          await window.assistant.runCommand({ action: 'system', command: 'lock' });
          break;

        case 'screenshot':
          await window.assistant.runCommand({ action: 'system', command: 'screenshot' });
          break;

        case 'shutdown':
          await window.assistant.runCommand({ action: 'system', command: 'shutdown' });
          break;

        case 'restart':
          await window.assistant.runCommand({ action: 'system', command: 'restart' });
          break;

        case 'sleep':
          await window.assistant.runCommand({ action: 'system', command: 'sleep' });
          break;

        case 'show_desktop':
          await window.assistant.runCommand({ action: 'system', command: 'show_desktop' });
          hideForTask(800);
          break;

        case 'task_manager':
          await window.assistant.runCommand({ action: 'system', command: 'task_manager' });
          hideForTask(800);
          break;

        case 'empty_trash':
          await window.assistant.runCommand({ action: 'system', command: 'empty_trash' });
          break;

        case 'set_timer':
          await window.assistant.runCommand({ action: 'set_timer', duration_seconds: cmd.duration_seconds || cmd.seconds, label: cmd.label });
          break;

        case 'run_shell': {
          jarvisTextEl.textContent = `Running: ${(cmd.command || '').substring(0, 60)}`;
          const r = await window.assistant.runCommand({ action: 'run_shell', command: cmd.command });
          if (r.output && r.output.trim()) {
            const out = r.output.trim().substring(0, 500);
            console.log(`[CMD] Shell output: ${out}`);
            jarvisTextEl.textContent = out;
            // Speak brief summary if output is long
            const spoken = out.length > 250 ? `Task completed, Sir Ahmad. Check the display for results.` : out;
            if (!window.speechSynthesis.speaking) {
              const u = new SpeechSynthesisUtterance(spoken);
              const v = getPreferredFemaleVoice();
              if (v) u.voice = v;
              u.rate = 0.95;
              window.speechSynthesis.speak(u);
            }
          } else if (!r.success && r.error) {
            jarvisTextEl.textContent = `Error: ${r.error.substring(0, 200)}`;
          }
          break;
        }

        case 'brightness':
          await window.assistant.runCommand({ action: 'brightness', level: cmd.level });
          break;

        case 'clipboard_write':
        case 'clipboard':
          await window.assistant.runCommand({ action: 'clipboard', op: cmd.op || 'write', text: cmd.text });
          break;

        case 'file_op': {
          const fr = await window.assistant.runCommand({
            action: 'file_op', op: cmd.op, path: cmd.path,
            content: cmd.content, from: cmd.from, to: cmd.to
          });
          if (fr.content) {
            jarvisTextEl.textContent = fr.content.substring(0, 400);
            console.log(`[CMD] File content read.`);
          }
          if (fr.items) {
            const list = fr.items.map(i => (i.isDir ? '[DIR] ' : '[FILE] ') + i.name).join('\n');
            jarvisTextEl.textContent = list.substring(0, 500);
          }
          break;
        }

        case 'open_path':
          await window.assistant.runCommand({ action: 'open_path', path: cmd.path });
          hideForTask(800);
          break;

        case 'kill_process':
          await window.assistant.runCommand({ action: 'kill_process', name: cmd.name });
          break;

        case 'type_text':
          await window.assistant.runCommand({ action: 'type_text', text: cmd.text });
          hideForTask(300);
          break;

        case 'keyboard_shortcut':
          await window.assistant.runCommand({ action: 'keyboard_shortcut', keys: cmd.keys });
          break;

        case 'wifi': {
          const wr = await window.assistant.runCommand({ action: 'wifi', op: cmd.op, ssid: cmd.ssid });
          if (wr.output) jarvisTextEl.textContent = wr.output.substring(0, 300);
          break;
        }

        case 'get_system_info': {
          const si = await window.assistant.runCommand({ action: 'get_system_info' });
          if (si.info) {
            const i = si.info;
            jarvisTextEl.textContent = `CPU: ${i.cpus} cores | RAM: ${i.freeMemGB}GB free / ${i.totalMemGB}GB | Uptime: ${i.uptimeHrs}hrs | ${i.platform}`;
          }
          break;
        }

        case 'get_battery': {
          const bi = await window.assistant.runCommand({ action: 'get_battery' });
          if (bi.success) jarvisTextEl.textContent = `Battery: ${bi.level}% ${bi.charging ? '(Charging)' : '(On Battery)'}`;
          break;
        }

        case 'get_disk_info': {
          const di = await window.assistant.runCommand({ action: 'get_disk_info' });
          if (di.disks) jarvisTextEl.textContent = di.disks.map(d => `${d.Name}: ${d.FreeGB}GB free`).join(' | ');
          break;
        }

        case 'get_processes': {
          const pi = await window.assistant.runCommand({ action: 'get_processes' });
          if (pi.processes) {
            const top = pi.processes.slice(0, 5).map(p => p.Name).join(', ');
            jarvisTextEl.textContent = `Top processes: ${top}`;
          }
          break;
        }

        case 'get_network_info': {
          const ni = await window.assistant.runCommand({ action: 'get_network_info' });
          if (ni.info) jarvisTextEl.textContent = ni.info.map(n => `${n.InterfaceAlias}: ${n.IPAddress}`).join(' | ');
          break;
        }

        default:
          console.warn(`[CMD] Unknown action: ${cmd.action}`);
      }
    } catch (e) {
      console.warn('[CMD] Failed to parse/execute command:', e.message);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TEXT-TO-SPEECH (DUAL ENGINE: GROQ ORPHEUS + WEB SPEECH API)
// ═══════════════════════════════════════════════════════════════════════════

// Voice configuration consolidated at top of file




// ═══════════════════════════════════════════════════════════════════════════
// SINGLE VOICE ENGINE — No overlap, proper locking
// ═══════════════════════════════════════════════════════════════════════════

let ttsAborted = false; // global abort flag
let ttsAbortController = null; // for canceling in-flight Groq TTS

function stopAllAudio() {
  ttsAborted = true;
  // Cancel in-flight Groq TTS API call
  if (ttsAbortController) {
    ttsAbortController.abort();
    ttsAbortController = null;
  }
  window.speechSynthesis.cancel();
  if (window.currentJARVISAudio) {
    window.currentJARVISAudio.pause();
    window.currentJARVISAudio.currentTime = 0;
    window.currentJARVISAudio = null;
  }
  isSpeaking = false;
  isProcessing = false;
  ignoreAudio = false;
}

function cancelPlayback() {
  console.log("[Speech] Canceling playback.");
  stopAllAudio();
  finishSpeakingState();
}

function finishSpeakingState() {
  isSpeaking = false;
  isProcessing = false;
  ignoreAudio = false;
  if (!jarvisAsleep) {
    vadEnabled = true; // welcome is done — now VAD is allowed to record
    updateStatus('LISTENING');
    // Only init STT once — sttInitialized flag prevents multiple starts
    if (!sttInitialized) {
      sttInitialized = true;
      initNativeSpeech();
      isListening = true;
    }
  }
}

// Typewriter effect — text appears word by word as JARVIS speaks
function typewriterText(text) {
  jarvisTextEl.textContent = '';
  const words = text.split(' ');
  let i = 0;
  const interval = setInterval(() => {
    if (i < words.length) {
      jarvisTextEl.textContent += (i === 0 ? '' : ' ') + words[i];
      i++;
    } else {
      clearInterval(interval);
    }
  }, 80); // one word every 80ms
  return interval;
}

async function speakTTS(text) {
  if (!text) { finishSpeakingState(); return; }

  while (isUserSpeaking) {
    await new Promise(r => setTimeout(r, 100));
  }

  ttsAborted = false;
  isSpeaking = true;
  ignoreAudio = true;
  updateStatus('SPEAKING');
  window.lastSpokenText = text;
  typewriterText(text);

  // Directly use Web Speech — reliable female voice, no API needed
  speakWebTTS(text);
}

// Split text into speakable chunks at sentence boundaries
function splitIntoChunks(text) {
  // Split on sentence endings but keep chunks reasonable
  const raw = text.match(/[^.!?]+[.!?]+/g) || [text];
  const chunks = [];
  let current = '';
  for (const s of raw) {
    if ((current + s).length > 200) {
      if (current) chunks.push(current.trim());
      current = s;
    } else {
      current += s;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.length > 0 ? chunks : [text];
}

async function tryGroqTTS(text) {
  if (ttsAborted) return false;
  try {
    console.log('[Groq TTS] Requesting...');
    const result = await window.assistant.groqTTS(text);
    if (ttsAborted) return true; // aborted while waiting
    if (!result.success) throw new Error(result.error);

    const audioData = Uint8Array.from(atob(result.audio), c => c.charCodeAt(0));
    const blob = new Blob([audioData], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    window.currentJARVISAudio = audio;

    if (ttsAborted) { URL.revokeObjectURL(url); window.currentJARVISAudio = null; return true; }

    await new Promise((resolve) => {
      audio.onended = () => { URL.revokeObjectURL(url); window.currentJARVISAudio = null; resolve(); };
      audio.onerror = () => { URL.revokeObjectURL(url); window.currentJARVISAudio = null; resolve(); };
      audio.play().catch(() => resolve());
    });

    if (!ttsAborted) finishSpeakingState();
    return true;
  } catch (err) {
    if (ttsAborted) return true;
    console.warn('[Groq TTS] Failed:', err.message);
    return false;
  }
}

function speakWebTTS(text) {
  if (ttsAborted) return;
  window.speechSynthesis.cancel();

  const chunks = splitIntoChunks(text);
  let chunkIndex = 0;

  function speakNextChunk() {
    if (ttsAborted || chunkIndex >= chunks.length) {
      if (!ttsAborted) finishSpeakingState();
      return;
    }

    const utt = new SpeechSynthesisUtterance(chunks[chunkIndex]);
    utt.rate = 0.93;
    utt.pitch = 1.15;
    utt.volume = 1;

    const v = getPreferredFemaleVoice();
    if (v) { utt.voice = v; console.log(`[TTS] Voice: ${v.name} chunk ${chunkIndex + 1}/${chunks.length}`); }

    utt.onend = () => { chunkIndex++; speakNextChunk(); };
    utt.onerror = (e) => {
      if (e.error === 'interrupted' || e.error === 'canceled') { return; }
      console.warn('[TTS] chunk error:', e.error);
      chunkIndex++;
      speakNextChunk();
    };

    window.speechSynthesis.speak(utt);
  }

  speakNextChunk();
}

// STT starts only after welcome completes via finishSpeakingState
// No auto-start here

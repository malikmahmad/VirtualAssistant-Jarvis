# JARVIS — Advanced AI Virtual Assistant

<img width="2926" height="1672" alt="image" src="https://github.com/user-attachments/assets/7b39c08f-5014-403c-a2a1-bc61a91a0d51" />


JARVIS is a futuristic, highly capable virtual assistant built with Electron and Python. It features a stunning "Stark Industries" HUD interface and leverages a multi-LLM architecture to provide real-time intelligence, system control, and automation.

## 🚀 System Architecture

### 1. Frontend (Electron HUD)
- **Visuals**: A premium, glassmorphism-inspired "Iron Man" HUD with real-time audio visualizers (Arc Reactor), system stat monitors, and cinematic animations.
- **Speech Stack**:
  - **STT (Speech-to-Text)**: Supports **Vosk (Local/Offline)**, **Groq Whisper**, and **Sarvam**.
  - **TTS (Text-to-Speech)**: Integrated with **Sarvam (Bulbul v3)**, **Groq Orpheus**, and native **Web Speech API**.
- **Interaction**: Features a "Clap to Wake" cinematic sequence and always-on voice listening.

### 2. Backend (Python MCP Server)
- **Model Context Protocol (MCP)**: A dedicated Python server (`mcp_server.py`) provides JARVIS with "hands" to interact with the OS.
- **Capabilities**:
  - **macOS Control**: Application launching, volume control, screen locking, screenshots, and system info.
  - **Web Intelligence**: Web scraping for summarization, news fetching via RSS, and advanced Chrome control via AppleScript.
  - **Workspace Automation**: One-command setup for 'Coding', 'Research', 'Relax', and 'Web Dev' modes.

### 3. Intelligence Layer
- **Groq (Llama 3.3/3.1)**: Used for sub-500ms intent detection and tool routing.
- **Gemini 3 Flash**: The primary conversational brain, providing high-intelligence responses with minimal latency.
- **OpenRouter (Gemma 4)**: Fallback engine and advanced reasoning specialist.

---

## 🛠️ Setup & Installation

### Prerequisites
- **macOS** (Optimized for Mac; some features may not work on Windows).
- **Node.js** (v18+)
- **Python 3.10+**

### 1. Clone & Install Dependencies
```bash
# Install JS dependencies
npm install

# Install Python dependencies
pip install fastmcp psutil feedparser requests beautifulsoup4
```

### 2. Environment Configuration
Create a `.env` file in the root directory and add your API keys:
```env
GROQ_API_KEY=gsk_...
GEMINI_API_KEY=AIza...
OPENROUTER_API_KEY=sk-or-...
SARVAM_API_KEY=your_sarvam_key
```

### 3. Run the App
```bash
npm start
```
*Note: On first run, it will download the Vosk model (~40MB) if not present in the `models/` folder.*

---

## 📦 Exporting & Distribution

To package the application into a standalone macOS `.app` or `.dmg` file:

```bash
npm run build
```
The build output will be located in the `dist/` folder.

---

## 🔧 Core Features

- **"Hey JARVIS"**: Start speaking anytime to interact.
- **"Clap to Wake"**: A loud clap wakes JARVIS up with a cinematic intro sequence.
- **Workspace Modes**: Say *"Setup coding workspace"* to automatically open Terminal, VS Code, and relevant browser tabs.
- **System Telemetry**: Real-time monitoring of CPU, RAM, and Network on the HUD.
- **Memory System**: JARVIS remembers facts you tell it about yourself (name, profession, etc.) across sessions.

---

## 👨‍💻 Created By
**Akshat Singh** — Tech Creator & Developer.
Designed to bring the future to the present.

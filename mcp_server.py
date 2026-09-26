import time
import platform
import psutil
import feedparser
import requests
import subprocess
from fastmcp import FastMCP

# Initialize the FastMCP server
mcp = FastMCP("JarvisSystemTools")

@mcp.tool()
def get_system_time() -> str:
    """Returns the current system time and date. Use this when the user asks for the time."""
    return time.strftime("%Y-%m-%d %H:%M:%S %Z")

@mcp.tool()
def get_system_info() -> str:
    """Returns basic system diagnostics like OS version, CPU usage, and Memory usage. Use this when the user asks about system performance or specs."""
    return f"""
    OS: {platform.system()} {platform.release()}
    CPU Usage: {psutil.cpu_percent()}%
    Memory Usage: {psutil.virtual_memory().percent}%
    """

@mcp.tool()
def get_latest_news(category: str = "general") -> str:
    """
    Fetches the latest news headlines. 
    It automatically opens the top 3 news stories in your browser and returns headlines for JARVIS to speak.
    Categories: general, technology, business, science, health.
    """
    import subprocess
    feeds = {
        "general": "http://feeds.bbci.co.uk/news/rss.xml",
        "technology": "http://feeds.bbci.co.uk/news/technology/rss.xml",
        "business": "http://feeds.bbci.co.uk/news/business/rss.xml",
        "science": "http://feeds.bbci.co.uk/news/science_and_environment/rss.xml",
        "health": "http://feeds.bbci.co.uk/news/health/rss.xml"
    }
    
    url = feeds.get(category.lower(), feeds["general"])
    try:
        feed = feedparser.parse(url)
        news_items = []
        
        # Open top 3 articles in Chrome
        for entry in feed.entries[:3]:
            subprocess.run(["open", "-a", "Google Chrome", entry.link])
            news_items.append(f"Headline: {entry.title}")
        
        if not news_items:
            return "I couldn't find any news articles at the moment, sir."
            
        return "Sir, I've opened the top three stories in your browser. The headlines are:\n" + "\n".join(news_items)
    except Exception as e:
        return f"Error fetching news: {str(e)}"

@mcp.tool()
def summarize_website(url: str) -> str:
    """
    Fetches the content of a website and extracts the main text for summarization.
    Use this when the user provides a specific link they want to discuss or summarize.
    """
    try:
        from bs4 import BeautifulSoup
        response = requests.get(url, timeout=10, headers={"User-Agent": "Mozilla/5.0"})
        response.raise_for_status()
        
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Remove script and style elements
        for script in soup(["script", "style"]):
            script.decompose()
            
        # Get text and clean it up
        text = soup.get_text()
        lines = (line.strip() for line in text.splitlines())
        chunks = (phrase.strip() for line in lines for phrase in line.split("  "))
        text = '\n'.join(chunk for chunk in chunks if chunk)
        
        # Return first 2000 characters to stay within LLM context
        return text[:2000]
    except Exception as e:
        return f"Error accessing website: {str(e)}"

@mcp.tool()
def open_application(app_name: str) -> str:
    """
    Opens a macOS application by name. 
    Examples: 'Safari', 'Chrome', 'Spotify', 'Finder', 'Terminal', 'Notes', 'Visual Studio Code'.
    """
    # Common mappings to ensure the correct app name is used with 'open -a'
    app_map = {
        "chrome": "Google Chrome",
        "google chrome": "Google Chrome",
        "browser": "Safari",
        "safari": "Safari",
        "music": "Music",
        "spotify": "Spotify",
        "vs code": "Visual Studio Code",
        "code": "Visual Studio Code",
        "whatsapp": "WhatsApp",
        "telegram": "Telegram",
        "slack": "Slack",
        "notes": "Notes",
        "calendar": "Calendar",
        "terminal": "Terminal",
        "finder": "Finder",
        "mail": "Mail",
        "discord": "Discord",
        "zoom": "zoom.us"
    }
    
    target_app = app_map.get(app_name.lower(), app_name)
    
    try:
        # Check if platform is macOS
        if platform.system() != "Darwin":
            return f"Opening applications is currently only supported on macOS, but we detected {platform.system()}."
            
        # Execute the 'open -a' command
        result = subprocess.run(["open", "-a", target_app], capture_output=True, text=True)
        
        if result.returncode == 0:
            return f"Successfully opened {target_app}, sir."
        else:
            # If failed, try opening it as a direct command (in case it's a CLI tool or script)
            return f"Failed to open {target_app}. Please ensure the application name is correct."
    except Exception as e:
        return f"Error trying to open {app_name}: {str(e)}"

@mcp.tool()
def open_url(url: str, browser: str = "default") -> str:
    """
    Opens a URL in the browser. 
    browser: 'default', 'chrome', 'safari'
    """
    if not url.startswith("http"):
        url = "https://" + url
        
    try:
        if browser.lower() == "chrome":
            subprocess.run(["open", "-a", "Google Chrome", url])
            return f"Opening {url} in Chrome, sir."
        elif browser.lower() == "safari":
            subprocess.run(["open", "-a", "Safari", url])
            return f"Opening {url} in Safari, sir."
        else:
            subprocess.run(["open", url])
            return f"Opening {url} in your default browser, sir."
    except Exception as e:
        return f"Error opening URL: {str(e)}"

@mcp.tool()
def setup_workspace(mode: str, dynamic_urls: list[str] = None) -> str:
    """
    Automates the setup of the user's workspace based on the specified mode.
    
    Modes available:
    - 'coding': Terminal, Notes, Chrome (GitHub, StackOverflow, YouTube for music)
    - 'content_creation': Pages, Photos, Chrome (YouTube Studio, X/Twitter)
    - 'research': Notes, Chrome (Google)
    - 'relax': Music, Chrome (YouTube)
    - 'design': Chrome (Figma, Dribbble, Pinterest)
    - 'finance': Chrome (TradingView, Yahoo Finance)
    - 'gaming': Chrome (Twitch, YouTube Gaming, Discord Web)
    - 'web_dev': Terminal, Chrome (GitHub, StackOverflow, localhost:3000)
    - 'custom': Use this mode for specific topics/research. You MUST provide 'dynamic_urls'.
    
    If 'dynamic_urls' is provided (a list of full URL strings), those URLs will be opened IN ADDITION to the predefined URLs for the mode. For maximum output during research, provide 3-5 highly relevant URLs in 'dynamic_urls' and set mode to 'custom' or 'research'.
    """
    import subprocess
    
    mode = mode.lower()
    if dynamic_urls is None:
        dynamic_urls = []
        
    workflows = {
        'coding': {
            'apps': ['Terminal', 'Notes'],
            'urls': ['https://github.com', 'https://stackoverflow.com', 'https://youtube.com/feed/music']
        },
        'content_creation': {
            'apps': ['Pages', 'Photos'],
            'urls': ['https://studio.youtube.com', 'https://x.com']
        },
        'research': {
            'apps': ['Notes'],
            'urls': ['https://google.com']
        },
        'relax': {
            'apps': ['Music'],
            'urls': ['https://youtube.com']
        },
        'design': {
            'apps': ['Notes'],
            'urls': ['https://figma.com', 'https://dribbble.com', 'https://pinterest.com']
        },
        'finance': {
            'apps': ['Numbers'],
            'urls': ['https://tradingview.com', 'https://finance.yahoo.com']
        },
        'gaming': {
            'apps': [],
            'urls': ['https://twitch.tv', 'https://gaming.youtube.com', 'https://discord.com/app']
        },
        'web_dev': {
            'apps': ['Terminal'],
            'urls': ['https://github.com', 'https://stackoverflow.com', 'http://localhost:3000']
        },
        'developer': {
            'apps': ['Terminal', 'Notes'],
            'urls': ['https://github.com', 'https://stackoverflow.com', 'https://youtube.com/feed/music']
        },
        'custom': {
            'apps': [],
            'urls': []
        }
    }
    
    if mode not in workflows:
        mode = 'custom'
        
    workflow = workflows[mode]
    final_urls = workflow['urls'] + dynamic_urls
    
    try:
        # Handle 'developer' special logic: Create folder and open Antigravity
        if mode == 'developer':
            import os
            from datetime import datetime
            desktop = os.path.expanduser("~/Desktop")
            projects_dir = os.path.join(desktop, "JARVIS_Workspaces")
            os.makedirs(projects_dir, exist_ok=True)
            
            timestamp = datetime.now().strftime("%Y%m%d_%H%M")
            new_folder = os.path.join(projects_dir, f"DevSession_{timestamp}")
            os.makedirs(new_folder, exist_ok=True)
            
            # Open Antigravity on the new folder
            antigravity_path = "/Users/akshatsingh/.antigravity/antigravity/bin/antigravity"
            if os.path.exists(antigravity_path):
                subprocess.run([antigravity_path, new_folder], check=False)
            
            # Also open Terminal at that folder
            subprocess.run(["open", "-a", "Terminal", new_folder], check=False)
        # 1. Open native apps
        for app in workflow['apps']:
            subprocess.run(["open", "-a", app], check=False)
            
        # 2. Open Chrome tabs
        if final_urls:
            urls_str = '", "'.join(final_urls)
            script = f'''
            tell application "Google Chrome"
                activate
                if (count every window) = 0 then
                    make new window
                end if
                set urlList to {{"{urls_str}"}}
                repeat with u in urlList
                    tell front window
                        make new tab with properties {{URL:u}}
                    end tell
                end repeat
            end tell
            '''
            subprocess.run(["osascript", "-e", script], check=True)
            
        return f"Successfully set up '{mode}' workspace. Opened apps: {', '.join(workflow['apps'])} and loaded {len(final_urls)} browser tabs."
    except Exception as e:
        return f"Error setting up workspace: {str(e)}"

@mcp.tool()
def chrome_control(action: str, url: str = None) -> str:
    """
    Advanced control for Google Chrome via AppleScript.
    Actions supported:
    - 'open_tab': Opens a new tab with the specified url.
    - 'extract_text': Extracts all readable text from the currently active tab in Chrome.
    
    Use 'open_tab' when the user asks to open multiple tabs or a specific website.
    Use 'extract_text' when the user asks you to read or explain the page they are currently looking at.
    """
    import subprocess
    
    try:
        if action == 'open_tab':
            if not url:
                return "URL is required for open_tab action."
            if not url.startswith('http'):
                url = 'https://' + url
            script = f'''
            tell application "Google Chrome"
                activate
                if (count every window) = 0 then
                    make new window
                end if
                tell front window
                    make new tab with properties {{URL:"{url}"}}
                end tell
            end tell
            '''
            subprocess.run(["osascript", "-e", script], check=True)
            return f"Successfully opened {url} in a new Chrome tab."
            
        elif action == 'extract_text':
            # Use JavaScript to extract innerText of the body
            script = '''
            tell application "Google Chrome"
                set activeTab to active tab of front window
                set pageText to execute activeTab javascript "document.body.innerText;"
                return pageText
            end tell
            '''
            result = subprocess.run(["osascript", "-e", script], capture_output=True, text=True, check=True)
            text = result.stdout.strip()
            
            if not text or text == "missing value":
                return "Could not extract text. The page might be empty, or Chrome is not open."
                
            # Truncate to first 5000 chars to avoid overwhelming the LLM
            if len(text) > 5000:
                text = text[:5000] + "\n...[Content truncated]"
                
            return f"Extracted text from current tab:\n\n{text}"
            
        else:
            return f"Unknown action: {action}. Supported actions are 'open_tab' and 'extract_text'."
            
    except subprocess.CalledProcessError as e:
        return f"Failed to execute Chrome command. Make sure Google Chrome is installed and running. Error: {e.stderr if e.stderr else str(e)}"
    except Exception as e:
        return f"Unexpected error controlling Chrome: {str(e)}"

@mcp.tool()
def search_web(query: str) -> str:
    """Performs a Google search for the given query and opens results in browser."""
    url = f"https://www.google.com/search?q={query.replace(' ', '+')}"
    return open_url(url)

@mcp.tool()
def research_topic(query: str, open_in_browser: bool = True) -> str:
    """
    Researches a topic when JARVIS doesn't know the answer.
    1. Searches Google for the query
    2. Scrapes the top result for content
    3. Opens the page in the user's browser so they can see it
    4. Returns the extracted text summary for JARVIS to explain
    
    Use this when the user asks about something you don't know or need current information about.
    """
    from bs4 import BeautifulSoup
    import re
    import requests
    import subprocess
    
    try:
        # Step 1: Google search to find the top result
        search_url = f"https://www.google.com/search?q={query.replace(' ', '+')}"
        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
        
        search_response = requests.get(search_url, headers=headers, timeout=10)
        search_soup = BeautifulSoup(search_response.text, 'html.parser')
        
        # Extract top result URLs from Google
        result_links = []
        for a_tag in search_soup.find_all('a', href=True):
            href = a_tag['href']
            if href.startswith('/url?q='):
                clean_url = href.split('/url?q=')[1].split('&')[0]
                # Skip Google's own pages, ads, and non-content links
                if not any(skip in clean_url for skip in ['google.com', 'youtube.com/redirect', 'accounts.google', 'support.google', 'maps.google']):
                    result_links.append(clean_url)
        
        if not result_links:
            # Fallback: try DuckDuckGo
            ddg_url = f"https://html.duckduckgo.com/html/?q={query.replace(' ', '+')}"
            ddg_response = requests.get(ddg_url, headers=headers, timeout=10)
            ddg_soup = BeautifulSoup(ddg_response.text, 'html.parser')
            for a_tag in ddg_soup.find_all('a', class_='result__a', href=True):
                href = a_tag['href']
                if href.startswith('http'):
                    result_links.append(href)
        
        if not result_links:
            # Last resort: just open the Google search page
            if open_in_browser:
                subprocess.run(["open", search_url])
            return f"I searched for '{query}' but couldn't extract specific results. I've opened the search page for you, sir."
        
        # Step 2: Open the top result in browser so user can see it
        top_url = result_links[0]
        if open_in_browser:
            subprocess.run(["open", top_url])
        
        # Step 3: Scrape the top result page for content
        try:
            page_response = requests.get(top_url, headers=headers, timeout=10)
            page_response.raise_for_status()
            page_soup = BeautifulSoup(page_response.text, 'html.parser')
            
            # Remove non-content elements
            for tag in page_soup(["script", "style", "nav", "footer", "header", "aside", "form", "iframe"]):
                tag.decompose()
            
            # Try to find main content areas
            main_content = page_soup.find('main') or page_soup.find('article') or page_soup.find('div', class_=re.compile(r'content|article|post|entry|text', re.I))
            
            if main_content:
                text = main_content.get_text(separator='\n', strip=True)
            else:
                # Fallback to all paragraph text
                paragraphs = page_soup.find_all('p')
                text = '\n'.join(p.get_text(strip=True) for p in paragraphs if len(p.get_text(strip=True)) > 30)
            
            # Clean up and limit
            lines = [line.strip() for line in text.splitlines() if line.strip() and len(line.strip()) > 10]
            clean_text = '\n'.join(lines[:40])  # Top 40 meaningful lines
            
            if len(clean_text) > 3000:
                clean_text = clean_text[:3000] + "..."
            
            if not clean_text:
                return f"I've opened {top_url} in your browser, sir, but couldn't extract readable text from the page. Please review it visually."
            
            return f"Source: {top_url}\n\n{clean_text}"
            
        except Exception as scrape_err:
            return f"I've opened {top_url} in your browser, sir. However, I wasn't able to read the page content automatically: {str(scrape_err)}"
    
    except Exception as e:
        # Even if everything fails, try to at least open the search
        try:
            subprocess.run(["open", f"https://www.google.com/search?q={query.replace(' ', '+')}"])
        except:
            pass
        return f"I encountered an issue researching '{query}': {str(e)}. I've opened a Google search for you instead, sir."

@mcp.tool()
def control_volume(level: int) -> str:
    """Sets the macOS system volume (0-100)."""
    try:
        # Scale 0-100 to 0-7 for AppleScript if needed, but 'set volume output volume' takes 0-100
        subprocess.run(["osascript", "-e", f"set volume output volume {level}"])
        return f"System volume set to {level} percent, sir."
    except Exception as e:
        return f"Error setting volume: {str(e)}"

@mcp.tool()
def get_battery_info() -> str:
    """Returns macOS battery percentage and power source info."""
    try:
        result = subprocess.run(["pmset", "-g", "batt"], capture_output=True, text=True)
        return f"Battery Status: {result.stdout.strip()}"
    except Exception as e:
        return f"Error checking battery: {str(e)}"

@mcp.tool()
def lock_screen() -> str:
    """Immediately locks the macOS screen."""
    try:
        subprocess.run(["osascript", "-e", 'tell application "System Events" to keystroke "q" using {command down, control down}'])
        return "Locking the station now, sir."
    except Exception as e:
        return f"Error locking screen: {str(e)}"

@mcp.tool()
def get_top_processes() -> str:
    """Returns the top 5 processes consuming CPU."""
    try:
        procs = sorted(psutil.process_iter(['name', 'cpu_percent']), key=lambda p: p.info['cpu_percent'], reverse=True)
        output = "Top CPU Consumers:\n"
        for p in procs[:5]:
            output += f"- {p.info['name']}: {p.info['cpu_percent']}%\n"
        return output
    except Exception as e:
        return f"Error fetching processes: {str(e)}"

@mcp.tool()
def take_screenshot(path: str = "~/Desktop/jarvis_screenshot.png") -> str:
    """Takes a screenshot of the macOS screen and saves it."""
    try:
        import os
        expanded_path = os.path.expanduser(path)
        subprocess.run(["screencapture", expanded_path])
        return f"Screenshot saved successfully to {expanded_path}, sir."
    except Exception as e:
        return f"Failed to take screenshot: {str(e)}"

@mcp.tool()
def get_clipboard() -> str:
    """Reads the current text from the macOS clipboard."""
    try:
        result = subprocess.run(["pbpaste"], capture_output=True, text=True)
        return result.stdout
    except Exception as e:
        return f"Error reading clipboard: {str(e)}"

@mcp.tool()
def set_clipboard(text: str) -> str:
    """Writes text to the macOS clipboard."""
    try:
        subprocess.run(["pbcopy"], input=text, text=True)
        return "Text copied to clipboard successfully, sir."
    except Exception as e:
        return f"Error setting clipboard: {str(e)}"

@mcp.tool()
def get_wifi_info() -> str:
    """Retrieves current Wi-Fi network information and connection strength."""
    try:
        result = subprocess.run(["/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport", "-I"], capture_output=True, text=True)
        return result.stdout
    except Exception as e:
        return f"Error fetching Wi-Fi info: {str(e)}"

@mcp.tool()
def list_open_ports() -> str:
    """Lists all active network ports currently listening on the machine."""
    try:
        # lsof -i -P | grep LISTEN (requires shell=True)
        result = subprocess.run("lsof -i -P | grep LISTEN", shell=True, capture_output=True, text=True)
        return result.stdout if result.stdout else "No listening ports found."
    except Exception as e:
        return f"Error listing ports: {str(e)}"

@mcp.tool()
def kill_port(port: int) -> str:
    """Kills the process running on a specific port."""
    try:
        subprocess.run(f"lsof -ti:{port} | xargs kill -9", shell=True)
        return f"Terminated the process running on port {port}, sir."
    except Exception as e:
        return f"Error killing port {port}: {str(e)}"

@mcp.tool()
def docker_status() -> str:
    """Lists all running Docker containers and their status."""
    try:
        result = subprocess.run(["docker", "ps", "--format", "table {{.Names}}\t{{.Status}}\t{{.Ports}}"], capture_output=True, text=True)
        return result.stdout if result.stdout else "No Docker containers currently running."
    except Exception as e:
        return "Error fetching Docker status. Is Docker Desktop running?"

@mcp.tool()
def search_codebase(pattern: str, path: str = ".") -> str:
    """Searches for a text pattern in code files (.py, .js, .ts) in a given path."""
    try:
        cmd = f"grep -r --include='*.py' --include='*.js' --include='*.ts' -n '{pattern}' {path}"
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
        return result.stdout[:2000] if result.stdout else f"No matches found for '{pattern}'."
    except Exception as e:
        return f"Error searching codebase: {str(e)}"

@mcp.tool()
def open_famous_news_website(channel: str = "cnn") -> str:
    """
    Opens the website of a famous news channel in the default browser.
    Valid channels: cnn, bbc, fox, al jazeera, nbc, bloomberg, reuters.
    """
    news_urls = {
        "cnn": "https://www.cnn.com",
        "bbc": "https://www.bbc.com/news",
        "fox": "https://www.foxnews.com",
        "al jazeera": "https://www.aljazeera.com",
        "aljazeera": "https://www.aljazeera.com",
        "nbc": "https://www.nbcnews.com",
        "bloomberg": "https://www.bloomberg.com",
        "reuters": "https://www.reuters.com",
        "sky": "https://news.sky.com"
    }
    
    url = news_urls.get(channel.lower())
    if not url:
        return f"I don't have '{channel}' in my primary news database, sir. Try CNN, BBC, or Reuters."
    
    try:
        subprocess.run(["open", url])
        return f"Opening {channel.upper()} in your browser now, sir. Fetching the latest news."
    except Exception as e:
        return f"Error opening the news website: {str(e)}"

if __name__ == "__main__":
    # Runs the MCP server on stdio transport by default
    mcp.run()

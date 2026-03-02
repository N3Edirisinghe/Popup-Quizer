# 🎯 Popup Quizer: Universal Quiz Assistant

A powerful, lightweight Chrome extension that uses AI (Groq Llama 3) to help you solve quizzes on any website. Designed to be fast, non-intrusive, and extremely easy to use.

## ✨ Features

- **🌍 Universal Detection**: Works on any website using radio buttons, ARIA roles (Google Forms), and specific Moodle selectors.
- **🧩 Advanced Question Types**: 
  - **MCQ**: Quick green flash animation on the correct choice.
  - **Drag-and-Drop**: Automatic detection of blanks and word chips with number badges.
  - **Dropdowns**: Auto-fills the correct choice in `<select>` elements.
- **⚡ High Performance**: 
  - **Parallel Processing**: Solves all questions on a page simultaneously.
  - **Auto-Retry**: Intelligent rate-limit handling with automatic backoff and retries.
- **🎨 Premium UX**: 
  - Minimalist design with smooth micro-animations.
  - Smart hover logic — only activates when you need it.
  - Clean UI with automatic cleanup of all indicators after 1-2 seconds.

## 🚀 Installation

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/N3Edirisinghe/Popup-Quizer.git
    ```
2.  **Get a Groq API Key**:
    - Sign up at [Groq Console](https://console.groq.com/).
    - Create a new API Key.
3.  **Configure the extension**:
    - Open `content.js` in a text editor.
    - Replace `YOUR_GROQ_API_KEY_HERE` with your actual API Key at the top of the file.
4.  **Load in Chrome**:
    - Open Chrome and go to `chrome://extensions`.
    - Enable **Developer mode** (top right).
    - Click **Load unpacked** and select the `Popup Quizer` folder.

## 📖 How to Use

1.  Navigate to any quiz website (Moodle, Google Forms, etc.).
2.  **Hover your mouse** over any question or its options.
3.  A tiny spinner will appear while the AI thinks.
4.  **MCQ**: The correct option will flash green for a second.
5.  **Drag-and-Drop**: Semi-transparent red numbers will appear on the word chips (showing which blank they go in) and then fade away.

## 🛠 Technology Stack

- **Core**: Vanilla JavaScript (ES6+), HTML5, CSS3
- **AI Engine**: Groq (Llama 3.3 70B Versatile)
- **Networking**: Fetch API with intelligent retry logic

## 📄 License

This project is open-source. Feel free to use and modify it.

---
*Created with ❤️ for better learning experiences.*

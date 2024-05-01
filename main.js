import "./style.css";
import {
  pipeline,
  env,
} from "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.1";
env.allowLocalModels = false;

const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = new SpeechRecognition();

// Preload the sound effect
const audio = new Audio("sounds/voice-button.mp3");
const audioEnd = new Audio("sounds/voice-button-end.mp3");
const thinkingAudio = new Audio("voice/givemeasec.wav");
const thinkingAudio2 = new Audio("voice/takealook.wav");
const thinkingAudio3 = new Audio("voice/havealook.wav");
const thinkingAudio4 = new Audio("voice/check.wav");
const audioList = [
  thinkingAudio,
  thinkingAudio2,
  thinkingAudio3,
  thinkingAudio4,
];
let currentThinkAudioIndex = 0;

const timeElement = document.querySelector(".time");
setInterval(() => {
  const currentTime = new Date();
  const hours = currentTime.getHours().toString().padStart(2, "0");
  const minutes = currentTime.getMinutes().toString().padStart(2, "0");
  const seconds = currentTime.getSeconds().toString().padStart(2, "0");
  const formattedTime = `${hours}:${minutes}`;
  timeElement.textContent = formattedTime;
}, 1000);

const progressElement = document.querySelector(".progress");
let progress = 0;
let timer;
(async () => {
  const generator = await pipeline(
    "text-generation",
    "Felladrin/onnx-TinyMistral-248M-Chat-v1",
    {
      progress_callback: (e) => {
        progress = Math.round(e.progress);

        progressElement.style.width = `${progress}%`;

        if (e.progress === 100) {
          document.querySelector(".loading-message").style.display = "none";
          document.querySelector(".progress-bar").style.display = "none";
        } else {
          document.querySelector(".loading-message").style.display = "block";
          document.querySelector(".progress-bar").style.display = "block";
        }
      },
    }
  );
  document.querySelector(".loading-message").style.display = "none";
  document.querySelector(".progress-bar").style.display = "none";
  document.querySelector(".response").textContent = "Hold the button to speak.";

  const speechButton = document.querySelector("#speech-button");

  speechButton.addEventListener("touchstart", startSpeechRecognition);
  speechButton.addEventListener("touchend", stopSpeechRecognition);
  speechButton.addEventListener("mousedown", startSpeechRecognition);
  speechButton.addEventListener("mouseup", stopSpeechRecognition);

  recognition.addEventListener("result", handleSpeechResult);
  function startSpeechRecognition() {
    document.querySelector(".response").textContent = "";
    recognition.start();
    // Play the sound effect
    audio.play();
  }

  function stopSpeechRecognition() {
    if (recognition) {
      recognition.stop();
      audioEnd.play();
      // recognition.removeEventListener("result", handleSpeechResult);
    }
  }

  function handleSpeechResult(event) {
    document.querySelector(".response").textContent = "...thinking";
    const transcript = event.results[0][0].transcript;
    console.log("Speech Recognition Result:", transcript);
    // Do something with the transcript, e.g., pass it to the generator
    generateText(transcript);
  }

  async function generateText(input) {
    if (currentThinkAudioIndex >= audioList.length) currentThinkAudioIndex = 0;
    currentThinkAudioIndex++;
    const randomAudio = audioList[currentThinkAudioIndex];
    randomAudio.play();

    document.querySelector(".response").textContent = "...thinking";
    // Define the list of messages
    const messages = [
      { role: "system", content: "You are a friendly assistant." },
      { role: "user", content: input },
    ];

    // Construct the prompt
    const prompt = generator.tokenizer.apply_chat_template(messages, {
      tokenize: false,
      add_generation_prompt: true,
    });

    setTimeout(async () => {
      // Generate a response
      const result = await generator(prompt, {
        max_new_tokens: 100,
        temperature: 0.7,
        do_sample: false,
        top_k: 50,
      });
      console.log(result[0].generated_text.split("assistant\n")[1]);
      const response = result[0].generated_text.split("assistant\n")[1];
      document.querySelector(".response").textContent = response;
    }, 1000);
  }
})();

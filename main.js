import "./style.css";
import {
  pipeline,
  env,
} from "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.1";
env.allowLocalModels = false;

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
  generateText("whats your name");
  const speechButton = document.querySelector("#speech-button");
  let recognition;

  speechButton.addEventListener("mousedown", startSpeechRecognition);
  speechButton.addEventListener("mouseup", stopSpeechRecognition);

  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  recognition.addEventListener("result", handleSpeechResult);
  function startSpeechRecognition() {
    document.querySelector(".response").textContent = "";
    recognition.start();
  }

  function stopSpeechRecognition() {
    if (recognition) {
      recognition.stop();
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
  }
})();

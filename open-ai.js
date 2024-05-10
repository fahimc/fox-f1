import OpenAI from "openai";

export const SPEAKERS = {
  "US female 1": "cmu_us_slt_arctic-wav-arctic_a0001",
  "US female 2": "cmu_us_clb_arctic-wav-arctic_a0001",
  "US male 1": "cmu_us_bdl_arctic-wav-arctic_a0003",
  "US male 2": "cmu_us_rms_arctic-wav-arctic_a0003",
  "Canadian male": "cmu_us_jmk_arctic-wav-arctic_a0002",
  "Scottish male": "cmu_us_awb_arctic-wav-arctic_b0002",
  "Indian male": "cmu_us_ksp_arctic-wav-arctic_a0007",
};

export const DEFAULT_SPEAKER = "cmu_us_slt_arctic-wav-arctic_a0001";

export class OpenAi {
  constructor() {
    this.mediaUrl = "";
    this.audioIsStopped = false;
    this.audio = null;
    this.openai = new OpenAI({
      dangerouslyAllowBrowser: true,
      apiKey: localStorage.getItem("open-ai-key"),
    });
    // Create a new worker and get the time
    this.worker = new Worker(new URL("worker.js", import.meta.url), {
      type: "module",
    });
    const modelFileProgressList = [];
    let previousProgress = 0;
    const progressElement = document.querySelector(".progress");
    this.worker.postMessage("getTime");
    this.worker.addEventListener("message", (event) => {
      const time = event.data;
      if (event.data.status === "progress") {
        if (
          !modelFileProgressList.find((item) => item.file === event.data.file)
        )
          modelFileProgressList.push({
            file: event.data.file,
            progress: event.data.progress,
          });
        const item = modelFileProgressList.find(
          (item) => item.file === event.data.file
        );
        item.progress = event.data.progress;
        // {
        //     "status": "progress",
        //     "name": "Xenova/speecht5_tts",
        //     "file": "generation_config.json",
        //     "progress": 100,
        //     "loaded": 185,
        //     "total": 185
        // }
        const lowestProgressItem = modelFileProgressList.reduce(
          (minItem, currentItem) => {
            return currentItem.progress < minItem.progress
              ? currentItem
              : minItem;
          }
        );

        let progress = lowestProgressItem.progress;
        if (progress < 100) {
          progressElement.style.width = `${progress}%`;
          document.querySelector(".loading-message").style.display = "block";
          document.querySelector(".progress-bar").style.display = "block";
          document.querySelector(".response").classList.add("hide");
        } else {
          progressElement.style.width = "100%";
          document.querySelector(".loading-message").style.display = "none";
          document.querySelector(".progress-bar").style.display = "none";
        }
        if (progress >= 100) {
          document.querySelector(".response").classList.remove("hide");
        }
        previousProgress = progress;
      } else if (event.data.status === "audio_complete") {
        if (this.audioIsStopped) {
          return;
        }
        document.querySelector("#processing-audio").classList.add("hide");
        const audioUrl = URL.createObjectURL(event.data.output);
        this.audio = new Audio(audioUrl);
        this.audio.play();
      }
    });
    this.tools = [
      {
        type: "function",
        function: {
          name: "get_time",
          description: "return the current time",
          parameters: {
            type: "object",
            properties: {},
            required: [],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "open_camera",
          description: "open the camera",
          parameters: {
            type: "object",
            properties: {},
            required: [],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "image_to_text",
          description:
            "describe the image in words and what the image contains",
          parameters: {
            type: "object",
            properties: {},
            required: [],
          },
        },
      },
    ];
    this.messages = [];
  }
  setMediaUrl(url) {
    this.mediaUrl = url;
  }
  async message(prompt) {
    this.messages = [
      {
        role: "system",
        content:
          "Your can answer questions. You can tell the time and do other functions. respond numbers in words. Make your response TTS friendly",
      },
      { role: "user", content: prompt },
    ];
    const completion = await this.openai.chat.completions.create({
      messages: this.messages,
      tools: this.tools,
      model: "gpt-3.5-turbo",
      tool_choice: "auto",
    });
    this.audioIsStopped = false;
    return await this.handleResponse(completion.choices[0].message);
  }
  async imageToText() {
    return new Promise((resolve, reject) => {
      this.worker.postMessage({
        type: "image",
        image: this.mediaUrl,
      });
      const handler = (event) => {
        if (event.data.status === "image_complete") {
          const data = event.data.output;
          this.worker.removeEventListener("message", handler);
          resolve(data);
        }
      };
      this.worker.addEventListener("message", handler);
    });
  }
  async launchCamera() {
    return new Promise(async (resolve, reject) => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
        });
        const videoElement = document.querySelector("#camera-video");
        videoElement.srcObject = stream;
        videoElement.autoplay = true;
        document.querySelector(".camera-screen").classList.remove("hide");
        resolve("Camera opened");
      } catch (error) {
        // console.error("Error accessing camera:", error);
        // reject(error);
        document.querySelector(".camera-screen").classList.remove("hide");
        resolve("Camera opened");
      }
    });
  }
  async getTimeFromWorker() {
    return new Promise((resolve, reject) => {
      this.worker.postMessage("getTime");
      const handler = (event) => {
        if (event.data.status === "time") {
          const time = event.data.timeInWords;
          this.worker.removeEventListener("message", handler);
          resolve(time);
        }
      };
      this.worker.addEventListener("message", handler);
    });
  }
  createAudioResponse(content) {
    document.querySelector("#processing-audio").classList.remove("hide");
    this.worker.postMessage({
      type: "audio",
      text: content,
      speaker_id: DEFAULT_SPEAKER,
    });
  }
  stopAudio() {
    this.audioIsStopped = true;
    this.audio?.pause();
  }
  async handleResponse(message) {
    this.messages.push(message);
    const toolCalls = message.tool_calls;
    if (message.tool_calls) {
      const availableFunctions = {
        get_time: this.getTimeFromWorker.bind(this),
        open_camera: this.launchCamera.bind(this),
        image_to_text: this.imageToText.bind(this),
      };
      for (const toolCall of toolCalls) {
        const functionName = toolCall.function.name;
        console.log(functionName);

        const functionToCall = availableFunctions[functionName];
        const functionArgs = JSON.parse(toolCall.function.arguments);
        let functionResponse;
        if (functionToCall) {
          functionResponse = await functionToCall(
            ...Object.values(functionArgs)
          );
        } else {
          functionResponse = "Function not found";
        }
        if (functionName === "image_to_text") {
          this.createAudioResponse(functionResponse[0].generated_text);
          return functionResponse[0].generated_text;
        }
        console.log(functionResponse);
        this.messages.push({
          tool_call_id: toolCall.id,
          role: "tool",
          name: functionName,
          content: functionResponse,
        }); // extend conversation with function response
      }
      const secondResponse = await this.openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: this.messages,
        tools: this.tools,
        tool_choice: "auto", // auto is default, but we'll be explicit
      }); // get a new response from the model where it can see the function response
      console.log(secondResponse.choices[0].message.content);
      this.createAudioResponse(secondResponse.choices[0].message.content);
      return secondResponse.choices[0].message.content;
    }
    this.createAudioResponse(message.content);
    return message.content;
  }
}

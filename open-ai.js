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
    this.audio = null;
    this.openai = new OpenAI({
      dangerouslyAllowBrowser: true,
      apiKey: localStorage.getItem("open-ai-key"),
    });
    // Create a new worker and get the time
    this.worker = new Worker(new URL("worker.js", import.meta.url), {
      type: "module",
    });
    const progressElement = document.querySelector(".progress");
    this.worker.postMessage("getTime");
    this.worker.addEventListener("message", (event) => {
      const time = event.data;
      if (event.data.status === "progress") {
        let progress = event.data.progress;
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
      } else if (event.data.status === "audio_complete") {
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
    ];
    this.messages = [];
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
    return await this.handleResponse(completion.choices[0].message);
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
    this.audio?.pause();
  }
  async handleResponse(message) {
    this.messages.push(message);
    const toolCalls = message.tool_calls;
    if (message.tool_calls) {
      const availableFunctions = {
        get_time: this.getTimeFromWorker.bind(this),
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

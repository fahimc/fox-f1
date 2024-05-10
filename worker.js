import {
  env,
  Tensor,
  AutoTokenizer,
  SpeechT5ForTextToSpeech,
  SpeechT5HifiGan,
  pipeline,
} from "@xenova/transformers";
import { encodeWAV } from "./utils/utils.js";

// Disable local model checks
env.allowLocalModels = false;

// Define model factories
// Ensures only one model is created of each type
class PipelineFactory {
  static task = null;
  static model = null;

  // NOTE: instance stores a promise that resolves to the pipeline
  static instance = null;

  constructor(tokenizer, model) {
    this.tokenizer = tokenizer;
    this.model = model;
  }

  /**
   * Get pipeline instance
   * @param {*} progressCallback
   * @returns {Promise}
   */
  static getInstance(progressCallback = null) {
    if (this.task === null || this.model === null) {
      throw Error("Must set task and model");
    }
    if (this.instance === null) {
      this.instance = pipeline(this.task, this.model, {
        progress_callback: progressCallback,
      });
    }

    return this.instance;
  }
}

class ImageToTextPipelineFactory extends PipelineFactory {
  static task = "image-to-text";
  static model = "Xenova/vit-gpt2-image-captioning";
}

// Use the Singleton pattern to enable lazy construction of the pipeline.
class MyTextToSpeechPipeline {
  static BASE_URL =
    "https://huggingface.co/datasets/Xenova/cmu-arctic-xvectors-extracted/resolve/main/";

  static model_id = "Xenova/speecht5_tts";
  static vocoder_id = "Xenova/speecht5_hifigan";

  static tokenizer_instance = null;
  static model_instance = null;
  static vocoder_instance = null;

  static async getInstance(progress_callback = null) {
    if (this.tokenizer_instance === null) {
      this.tokenizer = AutoTokenizer.from_pretrained(this.model_id, {
        progress_callback,
      });
    }

    if (this.model_instance === null) {
      this.model_instance = SpeechT5ForTextToSpeech.from_pretrained(
        this.model_id,
        {
          quantized: false,
          progress_callback,
        }
      );
    }

    if (this.vocoder_instance === null) {
      this.vocoder_instance = SpeechT5HifiGan.from_pretrained(this.vocoder_id, {
        quantized: false,
        progress_callback,
      });
    }

    return new Promise(async (resolve, reject) => {
      const result = await Promise.all([
        this.tokenizer,
        this.model_instance,
        this.vocoder_instance,
      ]);
      self.postMessage({
        status: "ready",
      });
      resolve(result);
    });
  }

  static async getSpeakerEmbeddings(speaker_id) {
    // e.g., `cmu_us_awb_arctic-wav-arctic_a0001`
    const speaker_embeddings_url = `${this.BASE_URL}${speaker_id}.bin`;
    const speaker_embeddings = new Tensor(
      "float32",
      new Float32Array(
        await (await fetch(speaker_embeddings_url)).arrayBuffer()
      ),
      [1, 512]
    );
    return speaker_embeddings;
  }
}

(async () => {
  // Mapping of cached speaker embeddings
  const speaker_embeddings_cache = new Map();
  const DEFAULT_SPEAKER = "cmu_us_slt_arctic-wav-arctic_a0001";
  const [tokenizer, model, vocoder] = await MyTextToSpeechPipeline.getInstance(
    (x) => {
      // We also add a progress callback so that we can track model loading.
      self.postMessage(x);
    }
  );

  const imagePipelineInstance = await ImageToTextPipelineFactory.getInstance(
    (x) => {
      // We also add a progress callback so that we can track model loading.
      self.postMessage(x);
    }
  );

  console.log(imagePipelineInstance);
  // Load the speaker embeddings
  let speaker_embeddings = speaker_embeddings_cache.get(DEFAULT_SPEAKER);

  if (speaker_embeddings === undefined) {
    speaker_embeddings = await MyTextToSpeechPipeline.getSpeakerEmbeddings(
      DEFAULT_SPEAKER
    );
    speaker_embeddings_cache.set(DEFAULT_SPEAKER, speaker_embeddings);
  }

  // Listen for messages from the main thread
  self.addEventListener("message", async (event) => {
    if (event.data.type === "image") {
      const response = await imagePipelineInstance(event.data.image);
      // const decodedText = pipeline.tokenizer.decode(beams[0].output_token_ids, {
      //     skip_special_tokens: true,
      // })
      self.postMessage({
        status: "image_complete",
        output: response,
      });
    }
    if (event.data.type === "audio") {
      // Load the pipeline
      // Tokenize the input
      const { input_ids } = tokenizer(event.data.text);

      // Generate the waveform
      const { waveform } = await model.generate_speech(
        input_ids,
        speaker_embeddings,
        { vocoder }
      );

      // Encode the waveform as a WAV file
      const wav = encodeWAV(waveform.data);
      // Send the output back to the main thread
      self.postMessage({
        status: "audio_complete",
        output: new Blob([wav], { type: "audio/wav" }),
      });
    }
  });

  // Function to handle incoming messages from the main thread
  self.addEventListener("message", function (event) {
    // Retrieve data from the message
    const data = event.data;

    // Check if the message is requesting the current time
    if (data === "getTime") {
      // Get the current time
      const currentTime = new Date().toLocaleTimeString();
      // Convert the current time to words
      const hours = new Date().getHours();
      const minutes = new Date().getMinutes();
      const timeInWords = convertTimeToWords(hours, minutes);

      // Send the time in words back to the main thread
      self.postMessage(timeInWords);

      // Function to convert time to words
      function convertTimeToWords(hours, minutes) {
        const hoursInWords = convertNumberToWords(hours % 12 || 12);
        const minutesInWords = convertNumberToWords(minutes);
        const amOrPm = hours < 12 ? "" : "";

        if (minutes === 0) {
          return `${hoursInWords} o'clock ${amOrPm}`;
        } else if (minutes < 10) {
          return `${hoursInWords} oh ${minutesInWords} ${amOrPm}`;
        } else {
          return `${hoursInWords} ${minutesInWords} ${amOrPm}`;
        }
      }

      // Function to convert number to words
      function convertNumberToWords(number) {
        const units = [
          "",
          "one",
          "two",
          "three",
          "four",
          "five",
          "six",
          "seven",
          "eight",
          "nine",
          "ten",
          "eleven",
          "twelve",
          "thirteen",
          "fourteen",
          "fifteen",
          "sixteen",
          "seventeen",
          "eighteen",
          "nineteen",
        ];
        const tens = ["", "", "twenty", "thirty", "forty", "fifty"];

        if (number < 20) {
          return units[number];
        } else {
          const tensDigit = Math.floor(number / 10);
          const unitsDigit = number % 10;
          return `${tens[tensDigit]} ${units[unitsDigit]}`;
        }
      }

      // Send the current time back to the main thread
      self.postMessage({
        status: "time",
        timeInWords,
      });
    }
  });
})();

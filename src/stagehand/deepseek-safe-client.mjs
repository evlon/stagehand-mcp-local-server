'use strict'
// import {createOpenAICompatible} from "@ai-sdk/openai-compatible";
// import {createOpenAI} from "@ai-sdk/openai";
import { LLMClient, validateZodSchema} from "@browserbasehq/stagehand";
import zodToJsonSchema from "zod-to-json-schema";
import { OpenAI } from "openai";

class DeepseekAIClient extends LLMClient {
  constructor({
    logger,
    modelName,
    clientOptions,
  }) {
    super({
    logger,
    modelName,
    clientOptions,
  });
    this.type = "deepseek";
    this.modelName = modelName;
    this.logger = logger;
    this.clientOptions = clientOptions;
    const modelNameToUse = this.modelName.startsWith("deepseek/")
      ? this.modelName.split("/")[1]
      : this.modelName;

    this.client = new OpenAI({
      ...clientOptions,
      baseURL: "https://api.deepseek.com/v1",
    });

  }

  async createChatCompletion({
    options,
    logger,
    retries = 3,
  }) {
    const { requestId, ...optionsWithoutImageAndRequestId } = options;

    logger({
      category: "deepseek",
      message: "creating chat completion",
      level: 2,
      auxiliary: {
        options: {
          value: JSON.stringify({
            ...optionsWithoutImageAndRequestId,
            requestId,
          }),
          type: "object",
        },
        modelName: {
          value: this.modelName,
          type: "string",
        },
      },
    });

    if (options.image) {
      const screenshotMessage = {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: {
              url: `data:image/jpeg;base64,${options.image.buffer.toString(
                "base64",
              )}`,
            },
          },
          ...(options.image.description
            ? [{ type: "text", text: options.image.description }]
            : []),
        ],
      };

      options.messages.push(screenshotMessage);
    }

    let responseFormat = undefined;
    if (options.response_model) {
      try {
        const json_schema = zodToJsonSchema(options.response_model.schema,{
            name: "ActResponseSchema",
            $refStrategy: "none", // 避免引用，直接内联定义
            target: "jsonSchema7" // 指定目标版本
            });
        const parsedSchema = JSON.stringify(json_schema);
        options.messages.push({
          role: "user",
          content: `Respond in this zod schema format:\n${parsedSchema}\n
          You must respond in JSON format. respond WITH JSON. Do not include any other text, formatting or markdown in your output. Do not include \`\`\` or \`\`\`json in your response. Only the JSON object itself.`,
        });
        responseFormat = { type: "json_object" };
      } catch (error) {
        logger({
          category: "deepseek",
          message: "Failed to parse response model schema",
          level: 0,
        });

        if (retries > 0) {
          return this.createChatCompletion({
            options,
            logger,
            retries: retries - 1,
          });
        }

        throw error;
      }
    }

    const { response_model, ...deepseekOptions } = {
      ...optionsWithoutImageAndRequestId,
      model: this.modelName,
    };

    logger({
      category: "deepseek",
      message: "creating chat completion",
      level: 2,
      auxiliary: {
        deepseekOptions: {
          value: JSON.stringify(deepseekOptions),
          type: "object",
        },
      },
    });

    const formattedMessages = options.messages.map((message) => {
      if (Array.isArray(message.content)) {
        const contentParts = message.content.map((content) => {
          if ("image_url" in content) {
            const imageContent = {
              image_url: {
                url: content.image_url.url,
              },
              type: "image_url",
            };
            return imageContent;
          } else {
            const textContent = {
              text: content.text,
              type: "text",
            };
            return textContent;
          }
        });

        if (message.role === "system") {
          const formattedMessage = {
            ...message,
            role: "system",
            content: contentParts
              .map((c) => (c.type === "text" ? c.text : ""))
              .join("\n"),
          };
          return formattedMessage;
        } else if (message.role === "user") {
          const formattedMessage = {
            ...message,
            role: "user",
            content: contentParts,
          };
          return formattedMessage;
        } else {
          const formattedMessage = {
            ...message,
            role: "assistant",
            content: contentParts
              .map((c) => (c.type === "text" ? c.text : ""))
              .join("\n"),
          };
          return formattedMessage;
        }
      }

      const formattedMessage = {
        role: "user",
        content: message.content,
      };

      return formattedMessage;
    });

    const modelNameToUse = this.modelName.startsWith("deepseek/")
      ? this.modelName.split("/")[1]
      : this.modelName;

    const body = {
      ...deepseekOptions,
      model: modelNameToUse,
      messages: formattedMessages,
      response_format: responseFormat,
      stream: false,
      tools: options.tools?.map((tool) => ({
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
        type: "function",
      })),
    };

     logger({
      category: "deepseek",
      message: "request",
      level: 2,
      auxiliary: {
        response: {
          value: JSON.stringify(body),
          type: "object",
        },
        requestId: {
          value: requestId,
          type: "string",
        },
      },
    });
    const response = await this.client.chat.completions.create(body);

    logger({
      category: "deepseek",
      message: "response",
      level: 2,
      auxiliary: {
        response: {
          value: JSON.stringify(response),
          type: "object",
        },
        requestId: {
          value: requestId,
          type: "string",
        },
      },
    });

    if (options.response_model) {
      const extractedData = response.choices[0]?.message.content;

      if (extractedData === null) {
        const errorMessage = "Response content is null.";
        logger({
          category: "deepseek",
          message: errorMessage,
          level: 0,
        });
        if (retries > 0) {
          return this.createChatCompletion({
            options,
            logger,
            retries: retries - 1,
          });
        }
        throw new Error(errorMessage);
      }

      const parsedData = JSON.parse(extractedData);

      try {
        validateZodSchema(options.response_model.schema, parsedData);
      } catch (e) {
        logger({
          category: "deepseek",
          message: "Response failed Zod schema validation",
          level: 0,
        });
        if (retries > 0) {
          return this.createChatCompletion({
            options,
            logger,
            retries: retries - 1,
          });
        }

        if (e instanceof Error) {
          logger({
            category: "deepseek",
            message: `Error during Deepseek chat completion: ${e.message}`,
            level: 0,
            auxiliary: {
              errorDetails: {
                value: `Message: ${e.message}${e.stack ? "\nStack: " + e.stack : ""}`,
                type: "string",
              },
              requestId: { value: requestId, type: "string" },
            },
          });
          throw new Error(e.message);
        }
        throw e;
      }

      return {
        data: parsedData,
        usage: response.usage,
      };
    }

    return response;
  }
}

export { DeepseekAIClient };
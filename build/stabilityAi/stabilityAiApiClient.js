import axios from "axios";
import FormData from "form-data";
import fs from "fs";
export class StabilityAiApiClient {
    apiKey;
    baseUrl = "https://api.stability.ai";
    axiosClient;
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.axiosClient = axios.create({
            baseURL: this.baseUrl,
            timeout: 120000,
            maxBodyLength: Infinity,
            maxContentLength: Infinity,
            headers: {
                Authorization: `Bearer ${this.apiKey}`,
                Accept: "application/json",
            },
        });
    }
    // https://platform.stability.ai/docs/api-reference#tag/Generate/paths/~1v2beta~1stable-image~1generate~1core/post
    async generateImageCore(prompt, options) {
        const payload = {
            prompt,
            output_format: "png",
            ...options,
        };
        return this.axiosClient
            .postForm(`${this.baseUrl}/v2beta/stable-image/generate/core`, axios.toFormData(payload, new FormData()))
            .then((res) => {
            const base64Image = res.data.image;
            return {
                base64Image,
            };
        });
    }
    async removeBackground(imageFilePath) {
        const payload = {
            image: fs.createReadStream(imageFilePath),
            output_format: "png",
        };
        try {
            const response = await this.axiosClient.postForm(`${this.baseUrl}/v2beta/stable-image/edit/remove-background`, axios.toFormData(payload, new FormData()));
            const base64Image = response.data.image;
            return { base64Image };
        }
        catch (error) {
            if (axios.isAxiosError(error) && error.response) {
                const data = error.response.data;
                if (error.response.status === 400) {
                    throw new Error(`Invalid parameters: ${data.errors.join(", ")}`);
                }
                throw new Error(`API error (${error.response.status}): ${JSON.stringify(data)}`);
            }
            throw error;
        }
    }
    async outpaint(imageFilePath, options) {
        const payload = {
            image: fs.createReadStream(imageFilePath),
            output_format: options.outputFormat || "png",
            left: options.left || 0,
            right: options.right || 0,
            up: options.up || 0,
            down: options.down || 0,
            ...(options.creativity !== undefined && {
                creativity: options.creativity,
            }),
            ...(options.prompt && { prompt: options.prompt }),
            ...(options.seed && { seed: options.seed }),
        };
        try {
            const response = await this.axiosClient.postForm(`${this.baseUrl}/v2beta/stable-image/edit/outpaint`, axios.toFormData(payload, new FormData()));
            const base64Image = response.data.image;
            return { base64Image };
        }
        catch (error) {
            if (axios.isAxiosError(error) && error.response) {
                const data = error.response.data;
                if (error.response.status === 400) {
                    throw new Error(`Invalid parameters: ${data.errors.join(", ")}`);
                }
                throw new Error(`API error (${error.response.status}): ${JSON.stringify(data)}`);
            }
            throw error;
        }
    }
    async searchAndReplace(imageFilePath, options) {
        const payload = {
            image: fs.createReadStream(imageFilePath),
            output_format: "png",
            search_prompt: options.searchPrompt,
            prompt: options.prompt,
        };
        try {
            const response = await this.axiosClient.postForm(`${this.baseUrl}/v2beta/stable-image/edit/search-and-replace`, axios.toFormData(payload, new FormData()));
            const base64Image = response.data.image;
            return { base64Image };
        }
        catch (error) {
            if (axios.isAxiosError(error) && error.response) {
                const data = error.response.data;
                if (error.response.status === 400) {
                    throw new Error(`Invalid parameters: ${data.errors.join(", ")}`);
                }
                throw new Error(`API error (${error.response.status}): ${JSON.stringify(data)}`);
            }
            throw error;
        }
    }
    async upscaleFast(imageFilePath) {
        const payload = {
            image: fs.createReadStream(imageFilePath),
            output_format: "png",
        };
        try {
            const response = await this.axiosClient.postForm(`${this.baseUrl}/v2beta/stable-image/upscale/fast`, axios.toFormData(payload, new FormData()));
            const base64Image = response.data.image;
            return { base64Image };
        }
        catch (error) {
            if (error.response?.status === 400 && error.response?.data?.errors) {
                const errorMessage = `Invalid parameters: ${error.response.data.errors.join(", ")}`;
                throw new Error(errorMessage);
            }
            throw new Error(`API error (${error.response?.status}): ${JSON.stringify(error.response?.data)}`);
        }
    }
    async fetchGenerationResult(id) {
        try {
            while (true) {
                const response = await this.axiosClient.get(`${this.baseUrl}/v2beta/results/${id}`, {
                    headers: {
                        Accept: "application/json",
                    },
                });
                if (response.status === 200) {
                    return { base64Image: response.data.result };
                }
                else if (response.status === 202) {
                    // Generation still in progress, wait 10 seconds before polling again
                    await new Promise((resolve) => setTimeout(resolve, 10000));
                }
                else {
                    throw new Error(`Unexpected status: ${response.status}`);
                }
            }
        }
        catch (error) {
            if (axios.isAxiosError(error) && error.response) {
                const data = error.response.data;
                if (error.response.status === 400) {
                    throw new Error(`Invalid parameters: ${data.errors.join(", ")}`);
                }
                throw new Error(`API error (${error.response.status}): ${JSON.stringify(data)}`);
            }
            throw error;
        }
    }
    async upscaleCreative(imageFilePath, options) {
        const payload = {
            image: fs.createReadStream(imageFilePath),
            prompt: options.prompt,
            output_format: options.outputFormat || "png",
            ...(options.negativePrompt && {
                negative_prompt: options.negativePrompt,
            }),
            ...(options.seed !== undefined && { seed: options.seed }),
            ...(options.creativity !== undefined && {
                creativity: options.creativity,
            }),
        };
        try {
            const response = await this.axiosClient.postForm(`${this.baseUrl}/v2beta/stable-image/upscale/creative`, axios.toFormData(payload, new FormData()));
            // Get the generation ID from the response
            const generationId = response.data.id;
            // Poll for the result
            return await this.fetchGenerationResult(generationId);
        }
        catch (error) {
            if (axios.isAxiosError(error) && error.response) {
                const data = error.response.data;
                if (error.response.status === 400) {
                    throw new Error(`Invalid parameters: ${data.errors.join(", ")}`);
                }
                throw new Error(`API error (${error.response.status}): ${JSON.stringify(data)}`);
            }
            throw error;
        }
    }
    async controlSketch(imageFilePath, options) {
        const payload = {
            image: fs.createReadStream(imageFilePath),
            prompt: options.prompt,
            output_format: options.outputFormat || "png",
            ...(options.controlStrength !== undefined && {
                control_strength: options.controlStrength,
            }),
            ...(options.negativePrompt && {
                negative_prompt: options.negativePrompt,
            }),
            ...(options.seed !== undefined && { seed: options.seed }),
        };
        try {
            const response = await this.axiosClient.postForm(`${this.baseUrl}/v2beta/stable-image/control/sketch`, axios.toFormData(payload, new FormData()));
            const base64Image = response.data.image;
            return { base64Image };
        }
        catch (error) {
            if (axios.isAxiosError(error) && error.response) {
                const data = error.response.data;
                if (error.response.status === 400) {
                    throw new Error(`Invalid parameters: ${data.errors.join(", ")}`);
                }
                throw new Error(`API error (${error.response.status}): ${JSON.stringify(data)}`);
            }
            throw error;
        }
    }
    async searchAndRecolor(imageFilePath, options) {
        const payload = {
            image: fs.createReadStream(imageFilePath),
            prompt: options.prompt,
            select_prompt: options.selectPrompt,
            output_format: options.outputFormat || "png",
            ...(options.growMask !== undefined && { grow_mask: options.growMask }),
            ...(options.negativePrompt && {
                negative_prompt: options.negativePrompt,
            }),
            ...(options.seed !== undefined && { seed: options.seed }),
        };
        try {
            const response = await this.axiosClient.postForm(`${this.baseUrl}/v2beta/stable-image/edit/search-and-recolor`, axios.toFormData(payload, new FormData()));
            const base64Image = response.data.image;
            return { base64Image };
        }
        catch (error) {
            if (axios.isAxiosError(error) && error.response) {
                const data = error.response.data;
                if (error.response.status === 400) {
                    throw new Error(`Invalid parameters: ${data.errors.join(", ")}`);
                }
                throw new Error(`API error (${error.response.status}): ${JSON.stringify(data)}`);
            }
            throw error;
        }
    }
    async replaceBackgroundAndRelight(imageFilePath, options) {
        const payload = {
            subject_image: fs.createReadStream(imageFilePath),
            output_format: options.outputFormat || "png",
            ...(options.backgroundPrompt && {
                background_prompt: options.backgroundPrompt,
            }),
            ...(options.backgroundReference && {
                background_reference: fs.createReadStream(options.backgroundReference),
            }),
            ...(options.foregroundPrompt && {
                foreground_prompt: options.foregroundPrompt,
            }),
            ...(options.negativePrompt && {
                negative_prompt: options.negativePrompt,
            }),
            ...(options.preserveOriginalSubject !== undefined && {
                preserve_original_subject: options.preserveOriginalSubject,
            }),
            ...(options.originalBackgroundDepth !== undefined && {
                original_background_depth: options.originalBackgroundDepth,
            }),
            ...(options.keepOriginalBackground !== undefined && {
                keep_original_background: options.keepOriginalBackground,
            }),
            ...(options.lightSourceDirection && {
                light_source_direction: options.lightSourceDirection,
            }),
            ...(options.lightReference && {
                light_reference: fs.createReadStream(options.lightReference),
            }),
            ...(options.lightSourceStrength !== undefined && {
                light_source_strength: options.lightSourceStrength,
            }),
            ...(options.seed !== undefined && { seed: options.seed }),
        };
        try {
            const response = await this.axiosClient.postForm(`${this.baseUrl}/v2beta/stable-image/edit/replace-background-and-relight`, axios.toFormData(payload, new FormData()));
            // Get the generation ID from the response
            const generationId = response.data.id;
            // Poll for the result
            return await this.fetchGenerationResult(generationId);
        }
        catch (error) {
            if (axios.isAxiosError(error) && error.response) {
                const data = error.response.data;
                if (error.response.status === 400) {
                    throw new Error(`Invalid parameters: ${data.errors.join(", ")}`);
                }
                throw new Error(`API error (${error.response.status}): ${JSON.stringify(data)}`);
            }
            throw error;
        }
    }
    async controlStyle(imageFilePath, options) {
        const payload = {
            image: fs.createReadStream(imageFilePath),
            prompt: options.prompt,
            output_format: options.outputFormat || "png",
            ...(options.negativePrompt && {
                negative_prompt: options.negativePrompt,
            }),
            ...(options.aspectRatio && {
                aspect_ratio: options.aspectRatio,
            }),
            ...(options.fidelity !== undefined && {
                fidelity: options.fidelity,
            }),
            ...(options.seed !== undefined && { seed: options.seed }),
        };
        try {
            const response = await this.axiosClient.postForm(`${this.baseUrl}/v2beta/stable-image/control/style`, axios.toFormData(payload, new FormData()));
            const base64Image = response.data.image;
            return { base64Image };
        }
        catch (error) {
            if (axios.isAxiosError(error) && error.response) {
                const data = error.response.data;
                if (error.response.status === 400) {
                    throw new Error(`Invalid parameters: ${data.errors.join(", ")}`);
                }
                throw new Error(`API error (${error.response.status}): ${JSON.stringify(data)}`);
            }
            throw error;
        }
    }
    async controlStructure(imageFilePath, options) {
        const payload = {
            image: fs.createReadStream(imageFilePath),
            prompt: options.prompt,
            output_format: options.outputFormat || "png",
            ...(options.controlStrength !== undefined && {
                control_strength: options.controlStrength,
            }),
            ...(options.negativePrompt && {
                negative_prompt: options.negativePrompt,
            }),
            ...(options.seed !== undefined && { seed: options.seed }),
        };
        try {
            const response = await this.axiosClient.postForm(`${this.baseUrl}/v2beta/stable-image/control/structure`, axios.toFormData(payload, new FormData()));
            const base64Image = response.data.image;
            return { base64Image };
        }
        catch (error) {
            if (axios.isAxiosError(error) && error.response) {
                const data = error.response.data;
                if (error.response.status === 400) {
                    throw new Error(`Invalid parameters: ${data.errors.join(", ")}`);
                }
                throw new Error(`API error (${error.response.status}): ${JSON.stringify(data)}`);
            }
            throw error;
        }
    }
}

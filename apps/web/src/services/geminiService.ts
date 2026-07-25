
import { GoogleGenAI } from "@google/genai";

// Always use a named parameter for apiKey and obtain it from process.env.API_KEY
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

export const getBusinessAdvice = async (dataContext: string) => {
  try {
    // Using gemini-3-flash-preview for basic text analysis task
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `As an ERP consultant, analyze this business data and provide 3 actionable, concise bullet points for improvement. Context: ${dataContext}`,
      config: {
        temperature: 0.7,
      }
    });
    // Access response.text directly (it's a property, not a method)
    return response.text;
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Optimize your inventory based on seasonal demand trends.";
  }
};

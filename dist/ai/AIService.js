// Simple AI service placeholder
export const AIService = {
    testAllConnections: async () => {
        return {
            GROK: { status: 'configured', message: 'API key present' },
            GEMINI_PRO: { status: 'configured', message: 'API key present' },
            CLAUDE: { status: 'configured', message: 'API key present' },
            CHATGPT: { status: 'configured', message: 'API key present' },
            DEEPSEEK: { status: 'configured', message: 'API key present' }
        };
    }
};
export default AIService;

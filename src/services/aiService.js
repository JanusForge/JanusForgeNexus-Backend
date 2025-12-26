console.log('🤖 AI Service loaded');

module.exports = {
  checkAIHealth: async () => {
    return {
      openai: process.env.OPENAI_API_KEY ? 'configured' : 'unavailable',
      claude: process.env.ANTHROPIC_API_KEY ? 'configured' : 'unavailable',
      gemini: process.env.GOOGLE_AI_API_KEY ? 'configured' : 'unavailable',
      deepseek: process.env.DEEPSEEK_API_KEY ? 'configured' : 'unavailable',
      grok: process.env.XAI_API_KEY || process.env.GROK_API_KEY ? 'configured' : 'unavailable'
    };
  }
};

import express from 'express';
const router = express.Router();
import crypto from 'crypto';
import Conversation from '../models/Conversation';

router.post('/ignite', async (req, res) => {
  try {
    const { prompt, models, userId, parentConversationId } = req.body;
    const aiClients = req.app.get('aiClients');

    // 1. MEMORY ARCHIVE: Load previous thread context if it exists
    let contextMessages: any[] = [];
    if (parentConversationId) {
      const thread = await Conversation.findById(parentConversationId);
      if (thread) {
        contextMessages.push({ role: "user", content: thread.prompt });
        thread.results.forEach((r: any) => {
          contextMessages.push({ role: "assistant", content: `${r.model} Output: ${r.response}` });
        });
      }
    }

    // 2. ADVERSARIAL SEQUENCING: Pure Design Parameters
    const currentSynthesisResults: any[] = [];
    
    for (const modelName of models) {
      // Build the peer-context from previous responders in this specific turn
      const peerContext = currentSynthesisResults.map(r => `[${r.model} Analysis]: ${r.response}`).join('\n\n');
      
      // Technical Directive: No roleplay, just synthesis.
      const technicalDirective = peerContext 
        ? `The following analysis has been provided by other models in the cluster. Evaluate these inputs and provide your independent synthesis based on your specific training and knowledge base:\n\n${peerContext}`
        : `Initiate a high-fidelity analysis based on your core design parameters.`;

      const finalPrompt = `${technicalDirective}\n\nArchitect Objective: ${prompt}`;

      try {
        const lowercaseModel = modelName.toLowerCase();

        // --- CLAUDE ---
        if (lowercaseModel.includes('claude')) {
          const msg = await aiClients.CLAUDE.messages.create({
            model: "claude-3-5-sonnet-20240620",
            max_tokens: 1024,
            messages: [...contextMessages, { role: "user", content: finalPrompt }],
          });
          currentSynthesisResults.push({ model: modelName, response: msg.content[0].text });
        }
        // --- GPT-4 ---
        else if (lowercaseModel.includes('gpt')) {
          const completion = await aiClients.GPT4.chat.completions.create({
            model: "gpt-4-turbo",
            messages: [...contextMessages, { role: "user", content: finalPrompt }],
          });
          currentSynthesisResults.push({ model: modelName, response: completion.choices[0].message.content });
        }
        // --- GEMINI ---
        else if (lowercaseModel.includes('gemini')) {
          const model = aiClients.GEMINI.getGenerativeModel({ model: "gemini-1.5-pro" });
          const result = await model.generateContent(finalPrompt);
          currentSynthesisResults.push({ model: modelName, response: result.response.text() });
        }
        // --- GROK / DEEPSEEK ---
        else if (lowercaseModel.includes('grok') || lowercaseModel.includes('deepseek')) {
          const client = lowercaseModel.includes('grok') ? aiClients.GROK : aiClients.DEEPSEEK;
          const completion = await client.chat.completions.create({
            model: lowercaseModel.includes('grok') ? "grok-beta" : "deepseek-chat",
            messages: [...contextMessages, { role: "user", content: finalPrompt }],
          });
          currentSynthesisResults.push({ model: modelName, response: completion.choices[0].message.content });
        }
      } catch (err) {
        console.error(`❌ ${modelName} Sync Error:`, err);
        currentSynthesisResults.push({ model: modelName, error: "Protocol Desync: Model unavailable." });
      }
    }

    // 3. PERSISTENCE & RETURN
    const cleanTitle = prompt.trim().replace(/\n/g, ' ').substring(0, 45) + (prompt.length > 45 ? '...' : '');
    const newConversation = await Conversation.create({
      userId,
      prompt,
      results: currentSynthesisResults,
      title: cleanTitle,
      type: 'NEXUS_PRIME',
      parentConversationId
    });

    res.status(200).json({ 
      success: true, 
      conversationId: newConversation._id, 
      results: currentSynthesisResults 
    });

  } catch (error) {
    console.error("❌ Nexus Synthesis Error:", error);
    res.status(500).json({ error: "Internal Synthesis Failure" });
  }
});

/**
 * 🛰️ NEURAL RETRIEVAL: Fetches a single synthesis by ID
 */
router.get('/synthesis/:id', async (req, res) => {
  try {
    const conversation = await Conversation.findById(req.params.id);
    if (!conversation) return res.status(404).json({ error: "Synthesis not found." });
    res.status(200).json(conversation);
  } catch (error) {
    res.status(500).json({ error: "Retrieval failed." });
  }
});

/**
 * 📂 HISTORY RETRIEVAL: Specifically for Nexus Prime
 */
router.get('/history/:userId', async (req, res) => {
  try {
    const history = await Conversation.find({
      userId: req.params.userId,
      type: 'NEXUS_PRIME'
    }).sort({ timestamp: -1 });
    res.status(200).json(history);
  } catch (error) {
    res.status(500).json({ error: "Could not retrieve history." });
  }
});

/* (Public Sharing routes remain same as defined earlier) */

export default router;

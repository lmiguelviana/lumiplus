import axios from 'axios';

const BASE_URL = 'http://localhost:3001/v1/knowledge';
const AGENT_ID = '6a8544c2-9772-41bf-8b41-b83918b27263'; // UUID real encontrado no banco

async function testRAG() {
  console.log('--- TEST RAG INJECTION ---');
  try {
    console.log('1. Uploading knowledge...');
    const uploadRes = await axios.post(`${BASE_URL}/${AGENT_ID}/upload`, {
      title: 'Manual de Teste',
      content: 'O Lumi Plus e uma plataforma de orquestracao de agentes de IA. O proximo passo e o CommandHandler.'
    });
    console.log('Upload Result:', uploadRes.data);

    console.log('2. Listing knowledge...');
    const listRes = await axios.get(`${BASE_URL}/${AGENT_ID}`);
    console.log('Total fragments found:', listRes.data.length);
    
    if (listRes.data.length > 0) {
      console.log('Fragment content:', listRes.data[0].content);
      console.log('SUCCESS: Knowledge injected correctly.');
    } else {
      console.error('FAILED: No fragments found after upload.');
    }

  } catch (error) {
    console.error('Error during RAG test:', error.response?.data || error.message);
  }
}

testRAG();

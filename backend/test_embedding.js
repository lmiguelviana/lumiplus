import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'openai/text-embedding-3-small';

async function test() {
  console.log('Testing embedding with model:', EMBEDDING_MODEL);
  try {
    const response = await axios.post(
      'https://openrouter.ai/api/v1/embeddings',
      {
        model: EMBEDDING_MODEL,
        input: 'Test message'
      },
      {
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 20000
      }
    );
    console.log('Success! Embedding length:', response.data.data[0].embedding.length);
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

test();

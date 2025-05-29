import axios from 'axios';
const PIPEDRIVE_API_TOKEN = process.env.PIPEDRIVE_API_TOKEN; 
const PIPEDRIVE_API_URL = 'https://api.pipedrive.com/v1';

export async function addNoteToPipedrive(content, dealId) {
    try {
        const response = await axios.post(
            `${PIPEDRIVE_API_URL}/notes?api_token=${PIPEDRIVE_API_TOKEN}`,
            {
                content,
                deal_id: dealId 
            }
        );
        return response.data;
    } catch (error) {
        console.error('Error adding note to Pipedrive:', error.response?.data || error.message);
        throw error;
    }
}

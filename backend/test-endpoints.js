const mongoose = require('mongoose');
const axios = require('axios');

// Test if the backend server is running and endpoints are accessible
async function testEndpoints() {
  console.log('Testing backend endpoints...');
  
  try {
    // Test the basic health of the server
    const response = await axios.get('http://localhost:5000/api/products/prices');
    console.log('Products endpoint working:', response.status === 200);
    
    if (response.data && response.data.length > 0) {
      const firstProduct = response.data[0];
      console.log('First product:', firstProduct);
      console.log('Product ID:', firstProduct._id);
      console.log('Collection:', firstProduct.collection);
      
      // Test the update endpoint
      const updateResponse = await axios.put(`http://localhost:5000/api/products/${firstProduct.collection}/${firstProduct._id}`, {
        style: 'Test Update'
      });
      console.log('Update endpoint working:', updateResponse.status === 200);
    }
  } catch (error) {
    console.error('Error testing endpoints:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

testEndpoints();

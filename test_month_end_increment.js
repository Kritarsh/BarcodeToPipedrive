// Test script to verify Month End quantity incrementing
const axios = require('axios');

const baseURL = 'http://localhost:3001'; // Adjust if your server runs on a different port

async function testMonthEndIncrement() {
  console.log('Testing Month End quantity increment functionality...\n');
  
  try {
    // Test 1: Month End UPC scan - should increment on repeated scans
    console.log('Test 1: Month End UPC scan with duplicate UPC');
    
    const testBarcode = 'TEST123456';
    const testSessionId = 'test-session-' + Date.now();
    
    // First scan
    const scan1 = await axios.post(`${baseURL}/api/month-end/barcode`, {
      scanType: 'sku',
      barcode: testBarcode,
      sessionId: testSessionId,
      qcFlaw: 'none'
    });
    
    console.log('First scan result:', scan1.data.message || scan1.data);
    
    // Second scan of the same UPC - should increment quantity
    const scan2 = await axios.post(`${baseURL}/api/month-end/barcode`, {
      scanType: 'sku',
      barcode: testBarcode,
      sessionId: testSessionId,
      qcFlaw: 'none'
    });
    
    console.log('Second scan result:', scan2.data.message || scan2.data);
    
    // Test 2: Month End manual reference - should increment on repeated entries
    console.log('\nTest 2: Month End manual reference with duplicate');
    
    const testManualRef = 'MANUAL123';
    
    // First manual entry
    const manual1 = await axios.post(`${baseURL}/api/month-end/barcode/manual`, {
      barcode: testBarcode,
      manualRef: testManualRef,
      sessionId: testSessionId,
      qcFlaw: 'none'
    });
    
    console.log('First manual entry result:', manual1.data.message || manual1.data);
    
    // Second manual entry of the same item - should increment quantity
    const manual2 = await axios.post(`${baseURL}/api/month-end/barcode/manual`, {
      barcode: testBarcode,
      manualRef: testManualRef,
      sessionId: testSessionId,
      qcFlaw: 'none'
    });
    
    console.log('Second manual entry result:', manual2.data.message || manual2.data);
    
    // Test 3: Check the actual data in Month End collections
    console.log('\nTest 3: Checking Month End Inventory data');
    
    const inventoryData = await axios.get(`${baseURL}/api/month-end-inventory`);
    console.log('Month End Inventory items count:', inventoryData.data.length);
    
    // Find our test items
    const testItems = inventoryData.data.filter(item => item.UPC === testBarcode);
    console.log('Test items found:', testItems.length);
    if (testItems.length > 0) {
      testItems.forEach((item, index) => {
        console.log(`Item ${index + 1}: UPC=${item.UPC}, Quantity=${item.Quantity}, RefNum=${item.RefNum}`);
      });
    }
    
    console.log('\nTest 4: Checking Month End Overstock data');
    
    const overstockData = await axios.get(`${baseURL}/api/month-end-overstock`);
    console.log('Month End Overstock items count:', overstockData.data.length);
    
    // Find our test items
    const testOverstockItems = overstockData.data.filter(item => item.UPC === testBarcode);
    console.log('Test overstock items found:', testOverstockItems.length);
    if (testOverstockItems.length > 0) {
      testOverstockItems.forEach((item, index) => {
        console.log(`Item ${index + 1}: UPC=${item.UPC}, Quantity=${item.Quantity}, RefNum=${item.RefNum}`);
      });
    }
    
  } catch (error) {
    console.error('Test error:', error.response?.data || error.message);
  }
}

// Run the test
testMonthEndIncrement();

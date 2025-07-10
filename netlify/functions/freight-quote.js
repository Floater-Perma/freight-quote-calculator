// netlify/functions/freight-quote.js
exports.handler = async (event, context) => {
  // Set CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // Parse the request body
    const requestData = JSON.parse(event.body);
    
    // Validate required fields
    if (!requestData.destinationZip || !requestData.quantity) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing required fields: destinationZip, quantity' })
      };
    }

    // Your Concept Logistics API credentials (set these in Netlify environment variables)
    const API_CONFIG = {
      username: process.env.CONCEPT_USERNAME,
      password: process.env.CONCEPT_PASSWORD,
      authToken: process.env.CONCEPT_AUTH_TOKEN,
      testUrl: 'https://ads.fmcloud.fm/Webservices/ConceptLogisticsRateRequestTEST.php',
      prodUrl: 'https://cls.conceptlogistics.com/Webservices/ConceptLogisticsRateRequest.php'
    };
    // DEBUG
console.log('DEBUG - Environment variables:', {
  username: process.env.CONCEPT_USERNAME ? 'SET' : 'NOT SET',
  password: process.env.CONCEPT_PASSWORD ? 'SET' : 'NOT SET',
  allEnvVars: Object.keys(process.env).filter(key => key.includes('CONCEPT'))
});
    // Validate credentials are set
    if (!API_CONFIG.username || !API_CONFIG.password || !API_CONFIG.authToken) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'API credentials not configured' })
      };
    }

    // Build the API request for Concept Logistics
    const apiRequest = {
      "Perma_APIRates": API_CONFIG.username,
      "dWja6j0SEWuwh8e": API_CONFIG.password,
      "3B7BB4A7-F2C3-8441-A130-CECDA9CAA5AE": API_CONFIG.authToken,
      "Mode": "LTL",
      "OriginZipCode": requestData.originZip || "14204",
      "OriginCountry": "US",
      "DestinationZipCode": requestData.destinationZip,
      "DestinationCountry": "US",
      "Commodities": [{
        "HandlingQuantity": parseInt(requestData.quantity),
        "PackagingType": requestData.packagingType || "Box",
        "Length": requestData.length || 60,
        "Width": requestData.width || 21,
        "Height": requestData.height || 30,
        "WeightTotal": (requestData.weightPerUnit || 145) * parseInt(requestData.quantity),
        "HazardousMaterial": false,
        "PiecesTotal": parseInt(requestData.quantity),
        "FreightClass": requestData.freightClass || "100",
        "Description": requestData.description || "Standard Product"
      }],
      "WeightUnits": "LB",
      "DimensionUnits": "IN",
      "NumberRatesReturned": 5,
      "RateType": "Best",
      "PickupDate": new Date().toLocaleDateString('en-US')
    };

    // Make the API call to Concept Logistics
    const response = await fetch(API_CONFIG.prodUrl, { // Change to prodUrl for production
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(apiRequest)
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    const apiResponse = await response.json();

    // Check if we got results
    if (!apiResponse || apiResponse.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'No rates available for this destination' })
      };
    }
    
    // Find the best rate (assuming first result is best or lowest cost)
    const bestRate = Array.isArray(apiResponse) ? apiResponse[0] : apiResponse;
    if (bestRate.ErrorMessage) {
  return {
    statusCode: 401,
    headers,
    body: JSON.stringify({ 
      error: 'Authentication failed with shipping API',
      message: bestRate.ErrorMessage 
    })
  };
}
    const markup = parseFloat(requestData.markup || 50.00);
    // Add this debug code here
    console.log('DEBUG - Full API Response:', JSON.stringify(apiResponse, null, 2));
    console.log('DEBUG - Best Rate Object:', JSON.stringify(bestRate, null, 2));
    // Format the response (adjust field names based on actual API response structure)
    const result = {
      baseRate: parseFloat(bestRate.priceLineHaul || bestRate.baseRate || 0),
      fuelSurcharge: parseFloat(bestRate.priceFuelSurcharge || bestRate.fuelSurcharge || 0),
      accessorials: parseFloat(bestRate.priceAccessorials || bestRate.accessorials || 0),
      subtotal: parseFloat(bestRate.priceTotal || bestRate.total || 0),
      markup: markup,
      total: parseFloat(bestRate.priceTotal || bestRate.total || 0) + markup,
      carrier: bestRate.carrierName || bestRate.carrier || 'Unknown',
      transitTime: bestRate.transitTime || bestRate.transitDays || 'Unknown'
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(result)
    };

  } catch (error) {
    console.error('Freight quote error:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Unable to calculate freight quote',
        message: error.message 
      })
    };
  }
};

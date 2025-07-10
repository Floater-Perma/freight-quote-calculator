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
      authToken: process.env.CONCEPT_AUTH_TOKEN ? 'SET' : 'NOT SET',
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

    // Build the API request for Concept Logistics using CORRECT field names
    const apiRequest = {
      "Autho_UserName": API_CONFIG.username,
      "Autho_Password": API_CONFIG.password,
      "3B7BB4A7-F2C3-8441-A130-CECDA9CAA5AE": API_CONFIG.authToken, // This appears to be the auth token field
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
        "FreightClass": parseInt(requestData.freightClass || 100),
        "Description": requestData.description || "Standard Product"
      }],
      "WeightUnits": "LB",
      "DimensionUnits": "IN",
      "NumberRatesReturned": 5,
      "RateType": "Best",
      "PickupDate": new Date().toLocaleDateString('en-US')
    };

    console.log('DEBUG - API Request:', JSON.stringify(apiRequest, null, 2));

    // Make the API call to Concept Logistics
    console.log('DEBUG - Making API call to:', API_CONFIG.prodUrl);
    
    let response;
    try {
      response = await fetch(API_CONFIG.prodUrl, { // Using TEST URL first
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(apiRequest),
        timeout: 30000 // 30 second timeout
      });
    } catch (fetchError) {
      console.log('DEBUG - Fetch error:', fetchError.message);
      throw new Error(`Network request failed: ${fetchError.message}`);
    }

    console.log('DEBUG - Response status:', response.status);
    console.log('DEBUG - Response headers:', Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const errorText = await response.text();
      console.log('DEBUG - Error response body:', errorText);
      throw new Error(`API request failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const responseText = await response.text();
    console.log('DEBUG - Raw response:', responseText);
    
    let apiResponse;
    try {
      apiResponse = JSON.parse(responseText);
    } catch (parseError) {
      console.log('DEBUG - JSON parse error:', parseError.message);
      throw new Error(`Invalid JSON response: ${responseText}`);
    }
    
    console.log('DEBUG - Parsed API Response:', JSON.stringify(apiResponse, null, 2));

    // Check if we got results
    if (!apiResponse || apiResponse.length === 0) {
      console.log('DEBUG - No rates returned from API');
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'No rates available for this destination' })
      };
    }
    
    // Find the best rate (assuming first result is best or lowest cost)
    const bestRate = Array.isArray(apiResponse) ? apiResponse[0] : apiResponse;
    console.log('DEBUG - Best Rate Object:', JSON.stringify(bestRate, null, 2));
    
    // Check for error message in various possible formats
    if (bestRate.ErrorMessage || bestRate.error || bestRate.Error) {
      const errorMsg = bestRate.ErrorMessage || bestRate.error || bestRate.Error;
      console.log('DEBUG - API returned error:', errorMsg);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: 'Shipping API error',
          message: errorMsg 
        })
      };
    }

    // Check if required fields are present
    if (!bestRate.priceTotal && !bestRate.total) {
      console.log('DEBUG - No pricing data in response');
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: 'No pricing data returned from API',
          debugInfo: bestRate 
        })
      };
    }

    const markup = parseFloat(requestData.markup || 50.00);
    
    // Calculate accessorials total from the array
    let accessorialsTotal = 0;
    if (bestRate.priceAccessorials && Array.isArray(bestRate.priceAccessorials)) {
      accessorialsTotal = bestRate.priceAccessorials.reduce((sum, acc) => sum + (acc.accessorialPrice || 0), 0);
    }

    // Format the response using the correct field names from the API documentation
    const result = {
      baseRate: parseFloat(bestRate.priceLineHaul || 0),
      fuelSurcharge: parseFloat(bestRate.priceFuelSurcharge || 0),
      accessorials: accessorialsTotal,
      subtotal: parseFloat(bestRate.priceTotal || 0),
      markup: markup,
      total: parseFloat(bestRate.priceTotal || 0) + markup,
      carrier: bestRate.carrierName || 'Unknown',
      transitTime: bestRate.transitTime || 'Unknown',
      serviceLevel: bestRate.serviceLevel || 'Unknown',
      apiQuoteNumber: bestRate.apiQuoteNumber || 'Unknown'
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

// netlify/functions/freight-quote.js
exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const requestData = JSON.parse(event.body);
    console.log('DEBUG - Incoming request:', JSON.stringify(requestData, null, 2));
    
    // Validate required fields
    if (!requestData.destinationZip || !requestData.quantity) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing required fields: destinationZip, quantity' })
      };
    }

    // API credentials from environment
    const API_CONFIG = {
      authToken: process.env.CONCEPT_AUTH_TOKEN || '6CE90699-1CC4-8248-8B96-693BB1CC8CB8',
      busId: process.env.CONCEPT_BUS_ID || 'YOUR_BUS_ID', // This may be required
      testUrl: 'https://ads.fmcloud.fm/Webservices/ConceptLogisticsRateRequestTEST.php'
    };

    console.log('DEBUG - API Config:', {
      authToken: API_CONFIG.authToken ? 'SET' : 'NOT SET',
      busId: API_CONFIG.busId ? 'SET' : 'NOT SET'
    });

    // Build request following the official API documentation
    const apiRequest = {
      "Autho_UserName": process.env.CONCEPT_USERNAME || 'Perma_APIRates',
      "Autho_Password": process.env.CONCEPT_PASSWORD || '9gmirSLpSA5SN5x',
      "Mode": "LTL",
      "OriginZipCode": requestData.originZip || "14204",
      "OriginCountry": "USA",
      "DestinationZipCode": requestData.destinationZip,
      "DestinationCountry": "USA",
      "Commodities": [{
        "HandlingQuantity": parseInt(requestData.quantity), // Numeric per docs
        "PackagingType": requestData.packagingType || "Box",
        "Length": requestData.length || 60,
        "Width": requestData.width || 21,
        "Height": requestData.height || 30,
        "WeightTotal": (requestData.weightPerUnit || 145) * parseInt(requestData.quantity),
        "HazardousMaterial": false, // Boolean value per docs
        "PiecesTotal": parseInt(requestData.quantity),
        "FreightClass": parseInt(requestData.freightClass || 100),
        "Description": requestData.description || "Standard Product"
      }],
      "WeightUnits": "LB", // Per documentation: LB=Pounds
      "DimensionUnits": "IN", // Per documentation: IN=Inches
      "NumberRatesReturned": 5,
      "RateType": "Best",
      "PickupDate": new Date().toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: '2-digit', 
        day: '2-digit' 
      }).replace(/(\d{2})\/(\d{2})\/(\d{4})/, '$1/$2/$3') // Ensure mm/dd/yyyy format
    };

    console.log('DEBUG - API Request:', JSON.stringify(apiRequest, null, 2));

    // Make API call with correct headers
    const response = await fetch(API_CONFIG.testUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'auth-token': API_CONFIG.authToken
      },
      body: JSON.stringify(apiRequest)
    });

    console.log('DEBUG - Response Status:', response.status);
    console.log('DEBUG - Response Headers:', Object.fromEntries(response.headers.entries()));

    const responseText = await response.text();
    console.log('DEBUG - Raw Response:', responseText);

    if (!response.ok) {
      console.log('DEBUG - API Error Response:', responseText);
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({ 
          error: 'API request failed',
          status: response.status,
          message: responseText
        })
      };
    }

    let apiResponse;
    try {
      apiResponse = JSON.parse(responseText);
    } catch (parseError) {
      console.log('DEBUG - JSON Parse Error:', parseError.message);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          error: 'Invalid JSON response',
          response: responseText
        })
      };
    }

    console.log('DEBUG - Parsed Response:', JSON.stringify(apiResponse, null, 2));

    // Check for no results
    if (!apiResponse || (Array.isArray(apiResponse) && apiResponse.length === 0)) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'No rates available' })
      };
    }

    // Get the best rate
    const bestRate = Array.isArray(apiResponse) ? apiResponse[0] : apiResponse;
    
    // Check for API errors
    if (bestRate.ErrorMessage || bestRate.error) {
      const errorMsg = bestRate.ErrorMessage || bestRate.error;
      console.log('DEBUG - API Error:', errorMsg);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: 'API Error',
          message: errorMsg
        })
      };
    }

    // Calculate markup
    const markup = parseFloat(requestData.markup || 50.00);
    
    // Calculate accessorials
    let accessorialsTotal = 0;
    if (bestRate.priceAccessorials && Array.isArray(bestRate.priceAccessorials)) {
      accessorialsTotal = bestRate.priceAccessorials.reduce((sum, acc) => sum + (acc.accessorialPrice || 0), 0);
    }

    // Format response
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

    console.log('DEBUG - Final Result:', JSON.stringify(result, null, 2));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(result)
    };

  } catch (error) {
    console.error('DEBUG - Error:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Request failed',
        message: error.message
      })
    };
  }
};

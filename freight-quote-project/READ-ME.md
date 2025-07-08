# Freight Quote Calculator - Netlify Functions

This project provides a secure proxy for the Concept Logistics freight quote API.

## Environment Variables Required:
- CONCEPT_USERNAME: Your Concept Logistics API username
- CONCEPT_PASSWORD: Your Concept Logistics API password

## Function Endpoint:
POST `/.netlify/functions/freight-quote`

## Request Format:
```json
{
  "destinationZip": "12345",
  "quantity": 1,
  "originZip": "83686",
  "weightPerUnit": 50,
  "freightClass": "85",
  "packagingType": "Pallet",
  "length": 20,
  "width": 20,
  "height": 10,
  "markup": 50.00,
  "description": "Standard Product"
}
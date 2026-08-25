import test from "node:test";
import assert from "node:assert/strict";
import { estimateRoomRent, validateRoomRentMarket } from "../scripts/lib/room-rent-estimate.mjs";

const assumptions = {asOf:"2026-08-24", operations:{roomRentFallbackMonthly:850}};
const market = {
  asOf:"2026-08-24",
  targetLease:{roomType:"private-bedroom"},
  marketZones:{"rock-hill":["29730","29732"],"gastonia":["28052"],"fort-mill":["29715"]},
  comparables:[
    {id:"a",provider:"Roomies",providerListingId:"a",monthlyRent:700,zipCode:"29730",bathroomType:"shared",furnished:false,utilitiesIncluded:true,parking:true,propertyType:"house",leaseType:"long-term",status:"active",updatedAsOf:"2026-08-24",sourceUrl:"https://example.com/a"},
    {id:"b",provider:"SpareRoom",providerListingId:"b",monthlyRent:750,zipCode:"29730",bathroomType:"shared",furnished:false,utilitiesIncluded:true,parking:true,propertyType:"house",leaseType:"long-term",status:"active",updatedAsOf:"2026-08-20",sourceUrl:"https://example.com/b"},
    {id:"c",provider:"Furnished Finder",providerListingId:"c",monthlyRent:1000,zipCode:"29730",bathroomType:"shared",furnished:true,utilitiesIncluded:true,parking:true,propertyType:"house",leaseType:"medium-term",status:"active",updatedAsOf:"2026-08-20",sourceUrl:"https://example.com/c"},
    {id:"gastonia-base",provider:"Roomies",providerListingId:"gastonia-base",monthlyRent:625,zipCode:"28052",bathroomType:"shared",furnished:false,utilitiesIncluded:true,parking:null,propertyType:"house",leaseType:"long-term",status:"active",updatedAsOf:"2026-08-24",sourceUrl:"https://example.com/gastonia-base"},
    {id:"fort-mill-base",provider:"Roomies",providerListingId:"fort-mill-base",monthlyRent:850,zipCode:"29715",bathroomType:"shared",furnished:false,utilitiesIncluded:true,parking:null,propertyType:"house",leaseType:"long-term",status:"active",updatedAsOf:"2026-08-24",sourceUrl:"https://example.com/fort-mill-base"},
    ...Array.from({length:9}, (_, index) => ({id:`x${index}`,provider:index % 2 ? "Roomies" : "SpareRoom",providerListingId:`x${index}`,monthlyRent:725 + index * 5,zipCode:index % 2 ? "29730" : "29732",bathroomType:"shared",furnished:false,utilitiesIncluded:true,parking:null,propertyType:"house",leaseType:"long-term",status:"active",updatedAsOf:"2026-08-24",sourceUrl:`https://example.com/x${index}`}))
  ].map(comparable => ({...comparable,accessed:"2026-08-24"}))
};

const property = {strategy:"shared-home",address:"1 Main St, Rock Hill, SC 29730",beds:3,baths:2,sqft:1200,yearBuilt:2000,pros:["Driveway parking"],concerns:[]};

test("validates comparable grain, sources, values, and uniqueness", () => {
  assert.deepEqual(validateRoomRentMarket(market), []);
  assert.match(validateRoomRentMarket({...market,comparables:[...market.comparables,market.comparables[0]]}).join(" "), /duplicate/);
});

test("produces a property-specific range from weighted room comparables", () => {
  const estimate = estimateRoomRent(property, assumptions, market);
  assert.equal(estimate.method, "weighted-room-comparables");
  assert.equal(estimate.subject.bathroomType, "shared");
  assert.equal(estimate.roomRents.length, 2);
  assert.ok(estimate.lowPerRoom <= estimate.expectedPerRoom);
  assert.ok(estimate.highPerRoom >= estimate.expectedPerRoom);
  assert.equal(estimate.totalExpectedMonthly, estimate.roomRents.reduce((sum, value) => sum + value, 0));
  assert.ok(estimate.comparableIds.length <= 8);
});

test("room size and condition evidence changes the property estimate", () => {
  const modern = estimateRoomRent({...property,yearBuilt:2024,sqft:1800}, assumptions, market);
  const constrained = estimateRoomRent({...property,yearBuilt:1950,sqft:850,concerns:["The layout may constrain common space"]}, assumptions, market);
  assert.ok(modern.expectedPerRoom > constrained.expectedPerRoom);
});

test("market zone changes the estimate for an otherwise identical property", () => {
  const regionalMarket = {...market,comparables:[
    ...market.comparables,
    ...Array.from({length:4}, (_, index) => ({id:`g${index}`,provider:"Roomies",providerListingId:`g${index}`,monthlyRent:575 + index * 25,zipCode:"28052",bathroomType:"shared",furnished:false,utilitiesIncluded:true,parking:null,propertyType:"house",leaseType:"long-term",status:"active",updatedAsOf:"2026-08-24",accessed:"2026-08-24",sourceUrl:`https://example.com/g${index}`}))
  ]};
  const rockHill = estimateRoomRent(property, assumptions, regionalMarket);
  const gastonia = estimateRoomRent({...property,address:"1 Main St, Gastonia, NC 28052"}, assumptions, regionalMarket);
  assert.notEqual(rockHill.expectedPerRoom, gastonia.expectedPerRoom);
  assert.equal(gastonia.subject.marketZone, "gastonia");
});

test("uses a clearly labeled fallback only when comparable data is unavailable", () => {
  const estimate = estimateRoomRent(property, assumptions, null);
  assert.equal(estimate.method, "fallback");
  assert.equal(estimate.expectedPerRoom, 850);
  assert.equal(estimate.confidence, "low");
});

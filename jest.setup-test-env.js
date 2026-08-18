// The timezone is pinned by `TZ=UTC` on the jest invocations in package.json, not
// here. V8 caches the zone the first time a Date is constructed, and jest's own
// bootstrap does that long before setup files run — so assigning process.env.TZ at
// this point sets the variable and changes nothing. It has to be in the
// environment before node starts.

// Environment variables
process.env.NEXT_PUBLIC_LULL_API_BASE_URL = 'http://localhost'

window.URL.createObjectURL = jest.fn()

window.matchMedia = jest.fn().mockReturnValue({
  addEventListener: jest.fn(),
  matches: false,
  removeEventListener: jest.fn(),
})

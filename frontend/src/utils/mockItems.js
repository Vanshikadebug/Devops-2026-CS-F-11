/**
 * Temporary mock data for Phase 2.
 *
 * WHY FAKE DATA?
 * The backend does not exist until Phase 3 and the database until
 * Phase 4. Without something to render, we cannot see whether the
 * card grid, the badges or the responsive layout actually work.
 *
 * The object shape deliberately matches what GET /api/items will
 * return later. When the real API arrives in Phase 8, we delete
 * this file and change one line in Home.jsx -- the components
 * themselves need no changes at all, because they were built
 * against the real shape from the start.
 *
 * DELETE THIS FILE IN PHASE 8.
 */

export const MOCK_ITEMS = [
  {
    id: 1,
    name: 'Data Structures & Algorithms textbook',
    description:
      'Second-year CSE textbook, barely used. A few pencil notes in the first chapter, otherwise clean.',
    category: 'Books',
    condition: 'Good',
    location: 'Jaipur, Rajasthan',
    image_url:
      'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=600&q=80',
    status: 'Available',
    owner_name: 'Aditi S.',
  },
  {
    id: 2,
    name: 'Wooden study desk',
    description:
      'Solid wood desk with two drawers. Moving out of the hostel, so it needs a new home.',
    category: 'Furniture',
    condition: 'Fair',
    location: 'Delhi',
    image_url:
      'https://images.unsplash.com/photo-1518455027359-f3f8164ba6bd?w=600&q=80',
    status: 'Available',
    owner_name: 'Rahul K.',
  },
  {
    id: 3,
    name: 'Wired over-ear headphones',
    description:
      'Works perfectly, 3.5mm jack. Upgraded to wireless so these are free to a good home.',
    category: 'Electronics',
    condition: 'Like New',
    location: 'Bengaluru, Karnataka',
    image_url:
      'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&q=80',
    status: 'Reserved',
    owner_name: 'Meera P.',
  },
  {
    id: 4,
    name: 'Winter jacket (size M)',
    description:
      'Warm padded jacket, worn for one season. No tears, zip works smoothly.',
    category: 'Clothing',
    condition: 'Good',
    location: 'Shimla, Himachal Pradesh',
    image_url:
      'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=600&q=80',
    status: 'Available',
    owner_name: 'Karan M.',
  },
  {
    id: 5,
    name: 'Drawing instrument box',
    description:
      'Complete engineering drawing set: compass, dividers, set squares and scale.',
    category: 'Stationery',
    condition: 'New',
    location: 'Pune, Maharashtra',
    image_url:
      'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=600&q=80',
    status: 'Available',
    owner_name: 'Sneha R.',
  },
  {
    id: 6,
    name: 'Desk lamp with adjustable arm',
    description:
      'LED study lamp, three brightness levels. Bulb included and working.',
    category: 'Other',
    condition: 'Good',
    location: 'Jaipur, Rajasthan',
    image_url:
      'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=600&q=80',
    status: 'Unavailable',
    owner_name: 'Vikram T.',
  },
]

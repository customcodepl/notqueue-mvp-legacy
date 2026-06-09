INSERT INTO venues (id, name)
VALUES ('a0000000-0000-4000-8000-000000000001', 'Demo Restaurant');

INSERT INTO venue_settings (venue_id, menu_link, info_text)
VALUES (
  'a0000000-0000-4000-8000-000000000001',
  'https://demo-restaurant.example/menu',
  'Please remain nearby — we will notify you when your table is ready.'
);

INSERT INTO parties (id, venue_id, display_name, party_size, position, eta_minutes, status)
VALUES (
  'b0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  'Smith',
  4,
  1,
  15,
  'waiting'
);

INSERT INTO guest_tokens (party_id, token)
VALUES ('b0000000-0000-4000-8000-000000000001', 'demo-guest-token-local-only');

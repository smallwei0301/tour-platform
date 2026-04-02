-- MVP seed data for Andy Lee
insert into users (id, role)
values ('11111111-1111-1111-1111-111111111111', 'guide')
on conflict (id) do nothing;

insert into guide_profiles (id, user_id, slug, display_name)
values (
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  'andy-lee',
  'Andy Lee'
)
on conflict (slug) do nothing;

insert into experiences (id, guide_id, slug, title, price_twd)
values (
  '33333333-3333-3333-3333-333333333333',
  '22222222-2222-2222-2222-222222222222',
  'chaishan-cave-tour',
  '柴山探洞體驗',
  1800
)
on conflict (slug) do nothing;

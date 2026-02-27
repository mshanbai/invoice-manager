-- 目的:
-- portal_companies を起点に、受け取り側会社セレクタで必要な
-- portal_company_profiles / portal_profile_links の初期データを作る。
-- 手動SQLではなく migration として再現可能にする。

-- idempotent upsert 用: owner_user_id + display_name を自然キーとして扱う
create unique index if not exists uq_portal_company_profiles_owner_display_name
  on public.portal_company_profiles(owner_user_id, display_name);

do $$
declare
  has_company_name boolean;
  has_postal_code boolean;
  has_address boolean;
  has_address_number boolean;
  has_building_name boolean;
  has_tel boolean;
  has_phone boolean;
  has_fax boolean;
  has_email boolean;
  company_name_expr text;
  postal_code_expr text;
  address_expr text;
  phone_expr text;
  fax_expr text;
  email_expr text;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'company_info' and column_name = 'company_name'
  ) into has_company_name;
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'company_info' and column_name = 'postal_code'
  ) into has_postal_code;
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'company_info' and column_name = 'address'
  ) into has_address;
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'company_info' and column_name = 'address_number'
  ) into has_address_number;
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'company_info' and column_name = 'building_name'
  ) into has_building_name;
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'company_info' and column_name = 'tel'
  ) into has_tel;
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'company_info' and column_name = 'phone'
  ) into has_phone;
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'company_info' and column_name = 'fax'
  ) into has_fax;
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'company_info' and column_name = 'email'
  ) into has_email;

  company_name_expr := case
    when has_company_name then 'nullif(trim(ci.company_name), '''')'
    else 'null'
  end;
  postal_code_expr := case
    when has_postal_code then 'nullif(trim(ci.postal_code), '''')'
    else 'null'
  end;
  address_expr := case
    when has_address and has_address_number and has_building_name
      then 'nullif(trim(concat_ws('''', ci.address, ci.address_number, ci.building_name)), '''')'
    when has_address
      then 'nullif(trim(ci.address), '''')'
    else 'null'
  end;
  phone_expr := case
    when has_tel then 'nullif(trim(ci.tel), '''')'
    when has_phone then 'nullif(trim(ci.phone), '''')'
    else 'null'
  end;
  fax_expr := case
    when has_fax then 'nullif(trim(ci.fax), '''')'
    else 'null'
  end;
  email_expr := case
    when has_email then 'nullif(trim(ci.email), '''')'
    else 'null'
  end;

  execute format(
    $seed$
    with seed_source as (
      select
        pc.id as portal_company_id,
        pc.user_id as owner_user_id,
        pc.company_info_id,
        %1$s as display_name,
        %2$s as postal_code,
        %3$s as address,
        %4$s as phone,
        %5$s as fax,
        %6$s as email
      from public.portal_companies pc
      left join public.company_info ci
        on ci.id = pc.company_info_id
      where pc.user_id is not null
    )
    insert into public.portal_company_profiles (
      owner_user_id,
      display_name,
      postal_code,
      address,
      phone,
      fax,
      email,
      source,
      created_at,
      updated_at
    )
    select
      s.owner_user_id,
      coalesce(s.display_name, '受取会社 ' || left(s.portal_company_id::text, 8)),
      s.postal_code,
      s.address,
      s.phone,
      s.fax,
      s.email,
      'invited',
      now(),
      now()
    from seed_source s
    on conflict (owner_user_id, display_name)
    do update set
      postal_code = coalesce(excluded.postal_code, public.portal_company_profiles.postal_code),
      address = coalesce(excluded.address, public.portal_company_profiles.address),
      phone = coalesce(excluded.phone, public.portal_company_profiles.phone),
      fax = coalesce(excluded.fax, public.portal_company_profiles.fax),
      email = coalesce(excluded.email, public.portal_company_profiles.email),
      updated_at = now();

    insert into public.portal_profile_links (
      profile_id,
      portal_company_id,
      created_at
    )
    select
      p.id,
      s.portal_company_id,
      now()
    from (
      select
        pc.id as portal_company_id,
        pc.user_id as owner_user_id,
        coalesce(%1$s, '受取会社 ' || left(pc.id::text, 8)) as display_name
      from public.portal_companies pc
      left join public.company_info ci
        on ci.id = pc.company_info_id
      where pc.user_id is not null
    ) s
    join public.portal_company_profiles p
      on p.owner_user_id = s.owner_user_id
     and p.display_name = s.display_name
    on conflict (profile_id, portal_company_id) do nothing;
    $seed$,
    company_name_expr,
    postal_code_expr,
    address_expr,
    phone_expr,
    fax_expr,
    email_expr
  );
end
$$;

select pg_notify('pgrst','reload schema');

-- 確認SQL（必要時に手動実行）
-- 1) migration 実行後に件数を確認:
-- select
--   (select count(*) from public.portal_company_profiles) as profiles,
--   (select count(*) from public.portal_profile_links) as links;
-- 2) 合格条件（再実行後も同じ判定でOK）:
--   profiles >= 1
--   links >= 1
-- 3) 追加確認:
-- select count(*) as portal_companies from public.portal_companies;
-- 4) 合格条件:
--   portal_companies >= 1
-- /api/portal/me/companies の想定件数は
-- owner_user_id = 対象ユーザー で profiles と links が join できる profile 数

BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL search_path = pg_catalog;
SET LOCAL client_min_messages = warning;
SET LOCAL row_security = off;
SET LOCAL statement_timeout = '120s';
SET LOCAL lock_timeout = '5s';

WITH
eligible_namespaces AS MATERIALIZED (
  SELECT n.oid, n.nspname, n.nspowner, n.nspacl
  FROM pg_catalog.pg_namespace AS n
  WHERE n.nspname <> 'information_schema'
    AND n.nspname !~ '^pg_'
),
managed_namespaces(name) AS MATERIALIZED (
  VALUES ('auth'::name), ('storage'::name)
),
schema_rows AS (
  SELECT jsonb_build_object(
    'canonicalKey', jsonb_build_array('schema', n.nspname),
    'name', n.nspname,
    'owner', pg_catalog.pg_get_userbyid(n.nspowner),
    'aclIsNull', n.nspacl IS NULL
  ) AS item
  FROM eligible_namespaces AS n
),
relation_rows AS (
  SELECT jsonb_build_object(
    'canonicalKey', jsonb_build_array('relation', n.nspname, c.relname),
    'schema', n.nspname,
    'name', c.relname,
    'kind', c.relkind,
    'persistence', c.relpersistence,
    'accessMethod', am.amname,
    'owner', pg_catalog.pg_get_userbyid(c.relowner),
    'replicaIdentity', c.relreplident,
    'isPartition', c.relispartition,
    'partitionBound', pg_catalog.pg_get_expr(c.relpartbound, c.oid, true),
    'partitionKey', pg_catalog.pg_get_partkeydef(c.oid),
    'viewDefinition', CASE WHEN c.relkind IN ('v', 'm') THEN pg_catalog.pg_get_viewdef(c.oid, true) ELSE NULL END,
    'options', COALESCE((SELECT jsonb_agg(option ORDER BY option) FROM unnest(c.reloptions) AS option), '[]'::jsonb),
    'foreignServer', fs.srvname,
    'foreignOptions', COALESCE((SELECT jsonb_agg(option ORDER BY option) FROM unnest(ft.ftoptions) AS option), '[]'::jsonb)
  ) AS item
  FROM pg_catalog.pg_class AS c
  JOIN eligible_namespaces AS n ON n.oid = c.relnamespace
  LEFT JOIN pg_catalog.pg_am AS am ON am.oid = c.relam
  LEFT JOIN pg_catalog.pg_foreign_table AS ft ON ft.ftrelid = c.oid
  LEFT JOIN pg_catalog.pg_foreign_server AS fs ON fs.oid = ft.ftserver
  WHERE c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
),
sequence_rows AS (
  SELECT jsonb_build_object(
    'canonicalKey', jsonb_build_array('sequence', n.nspname, c.relname),
    'schema', n.nspname,
    'name', c.relname,
    'dataType', tn.nspname || '.' || t.typname,
    'start', s.seqstart,
    'increment', s.seqincrement,
    'min', s.seqmin,
    'max', s.seqmax,
    'cache', s.seqcache,
    'cycle', s.seqcycle
  ) AS item
  FROM pg_catalog.pg_sequence AS s
  JOIN pg_catalog.pg_class AS c ON c.oid = s.seqrelid
  JOIN eligible_namespaces AS n ON n.oid = c.relnamespace
  JOIN pg_catalog.pg_type AS t ON t.oid = s.seqtypid
  JOIN pg_catalog.pg_namespace AS tn ON tn.oid = t.typnamespace
),
column_rows AS (
  SELECT jsonb_build_object(
    'canonicalKey', jsonb_build_array('column', n.nspname, c.relname, a.attname),
    'schema', n.nspname,
    'relation', c.relname,
    'position', a.attnum,
    'name', a.attname,
    'typeSchema', tn.nspname,
    'typeName', ty.typname,
    'formattedType', pg_catalog.format_type(a.atttypid, a.atttypmod),
    'notNull', a.attnotnull,
    'default', pg_catalog.pg_get_expr(ad.adbin, ad.adrelid, true),
    'identity', a.attidentity,
    'generated', a.attgenerated,
    'collationSchema', cn.nspname,
    'collationName', co.collname,
    'storage', a.attstorage,
    'compression', a.attcompression,
    'aclIsNull', a.attacl IS NULL
  ) AS item
  FROM pg_catalog.pg_attribute AS a
  JOIN pg_catalog.pg_class AS c ON c.oid = a.attrelid
  JOIN eligible_namespaces AS n ON n.oid = c.relnamespace
  JOIN pg_catalog.pg_type AS ty ON ty.oid = a.atttypid
  JOIN pg_catalog.pg_namespace AS tn ON tn.oid = ty.typnamespace
  LEFT JOIN pg_catalog.pg_attrdef AS ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
  LEFT JOIN pg_catalog.pg_collation AS co ON co.oid = a.attcollation
  LEFT JOIN pg_catalog.pg_namespace AS cn ON cn.oid = co.collnamespace
  WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f')
    AND a.attnum > 0
    AND NOT a.attisdropped
),
type_rows AS (
  SELECT jsonb_build_object(
    'canonicalKey', jsonb_build_array('type', n.nspname, t.typname),
    'schema', n.nspname,
    'name', t.typname,
    'kind', t.typtype,
    'category', t.typcategory,
    'owner', pg_catalog.pg_get_userbyid(t.typowner),
    'aclIsNull', t.typacl IS NULL,
    'baseType', CASE WHEN t.typbasetype = 0 THEN NULL ELSE pg_catalog.format_type(t.typbasetype, t.typtypmod) END,
    'notNull', t.typnotnull,
    'default', t.typdefault,
    'enumLabels', CASE WHEN t.typtype = 'e' THEN (
      SELECT jsonb_agg(e.enumlabel ORDER BY e.enumsortorder)
      FROM pg_catalog.pg_enum AS e
      WHERE e.enumtypid = t.oid
    ) ELSE NULL END,
    'rangeSubtype', CASE WHEN t.typtype IN ('r', 'm') THEN pg_catalog.format_type(r.rngsubtype, NULL) ELSE NULL END
  ) AS item
  FROM pg_catalog.pg_type AS t
  JOIN eligible_namespaces AS n ON n.oid = t.typnamespace
  LEFT JOIN pg_catalog.pg_range AS r ON r.rngtypid = t.oid
  LEFT JOIN pg_catalog.pg_class AS tc ON tc.oid = t.typrelid
  WHERE t.typisdefined
    AND (t.typtype IN ('e', 'd', 'r', 'm') OR (t.typtype = 'c' AND tc.relkind = 'c'))
),
constraint_rows AS (
  SELECT jsonb_build_object(
    'canonicalKey', jsonb_build_array('constraint', 'relation', n.nspname, c.relname, con.conname),
    'targetKind', 'relation',
    'schema', n.nspname,
    'relation', c.relname,
    'name', con.conname,
    'type', con.contype,
    'validated', con.convalidated,
    'deferrable', con.condeferrable,
    'deferred', con.condeferred,
    'definition', pg_catalog.pg_get_constraintdef(con.oid, true)
  ) AS item
  FROM pg_catalog.pg_constraint AS con
  JOIN pg_catalog.pg_class AS c ON c.oid = con.conrelid
  JOIN eligible_namespaces AS n ON n.oid = c.relnamespace
  WHERE con.conrelid <> 0
  UNION ALL
  SELECT jsonb_build_object(
    'canonicalKey', jsonb_build_array('constraint', 'domain', n.nspname, t.typname, con.conname),
    'targetKind', 'domain',
    'schema', n.nspname,
    'domain', t.typname,
    'name', con.conname,
    'type', con.contype,
    'validated', con.convalidated,
    'deferrable', con.condeferrable,
    'deferred', con.condeferred,
    'definition', pg_catalog.pg_get_constraintdef(con.oid, true)
  )
  FROM pg_catalog.pg_constraint AS con
  JOIN pg_catalog.pg_type AS t ON t.oid = con.contypid
  JOIN eligible_namespaces AS n ON n.oid = t.typnamespace
  WHERE con.contypid <> 0
),
index_rows AS (
  SELECT jsonb_build_object(
    'canonicalKey', jsonb_build_array('index', n.nspname, i.relname),
    'schema', n.nspname,
    'relation', c.relname,
    'name', i.relname,
    'unique', x.indisunique,
    'primary', x.indisprimary,
    'valid', x.indisvalid,
    'replicaIdentity', x.indisreplident,
    'definition', pg_catalog.pg_get_indexdef(i.oid)
  ) AS item
  FROM pg_catalog.pg_index AS x
  JOIN pg_catalog.pg_class AS i ON i.oid = x.indexrelid
  JOIN pg_catalog.pg_class AS c ON c.oid = x.indrelid
  JOIN eligible_namespaces AS n ON n.oid = c.relnamespace
),
routine_rows AS (
  SELECT jsonb_build_object(
    'canonicalKey', jsonb_build_array('routine', n.nspname, p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid)),
    'schema', n.nspname,
    'name', p.proname,
    'identityArguments', pg_catalog.pg_get_function_identity_arguments(p.oid),
    'kind', p.prokind,
    'result', pg_catalog.pg_get_function_result(p.oid),
    'language', l.lanname,
    'volatility', p.provolatile,
    'parallel', p.proparallel,
    'securityDefiner', p.prosecdef,
    'leakProof', p.proleakproof,
    'strict', p.proisstrict,
    'configuration', COALESCE(to_jsonb(p.proconfig), '[]'::jsonb),
    'definition', pg_catalog.pg_get_functiondef(p.oid)
  ) AS item
  FROM pg_catalog.pg_proc AS p
  JOIN eligible_namespaces AS n ON n.oid = p.pronamespace
  JOIN pg_catalog.pg_language AS l ON l.oid = p.prolang
  WHERE p.prokind IN ('f', 'p', 'w')
),
trigger_rows AS (
  SELECT jsonb_build_object(
    'canonicalKey', jsonb_build_array('trigger', n.nspname, c.relname, t.tgname),
    'schema', n.nspname,
    'relation', c.relname,
    'name', t.tgname,
    'enabled', t.tgenabled,
    'definition', pg_catalog.pg_get_triggerdef(t.oid, true)
  ) AS item
  FROM pg_catalog.pg_trigger AS t
  JOIN pg_catalog.pg_class AS c ON c.oid = t.tgrelid
  JOIN eligible_namespaces AS n ON n.oid = c.relnamespace
  WHERE NOT t.tgisinternal
),
rls_rows AS (
  SELECT jsonb_build_object(
    'canonicalKey', jsonb_build_array('rls', n.nspname, c.relname),
    'schema', n.nspname,
    'relation', c.relname,
    'enabled', c.relrowsecurity,
    'forced', c.relforcerowsecurity
  ) AS item
  FROM pg_catalog.pg_class AS c
  JOIN eligible_namespaces AS n ON n.oid = c.relnamespace
  WHERE c.relkind IN ('r', 'p')
),
policy_rows AS (
  SELECT jsonb_build_object(
    'canonicalKey', jsonb_build_array('policy', n.nspname, c.relname, p.polname),
    'schema', n.nspname,
    'relation', c.relname,
    'name', p.polname,
    'permissive', p.polpermissive,
    'command', p.polcmd,
    'roles', (
      SELECT jsonb_agg(
        CASE WHEN role_id = 0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(role_id) END
        ORDER BY CASE WHEN role_id = 0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(role_id) END
      )
      FROM unnest(p.polroles) AS role_id
    ),
    'using', pg_catalog.pg_get_expr(p.polqual, p.polrelid, true),
    'check', pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid, true)
  ) AS item
  FROM pg_catalog.pg_policy AS p
  JOIN pg_catalog.pg_class AS c ON c.oid = p.polrelid
  JOIN eligible_namespaces AS n ON n.oid = c.relnamespace
),
acl_source AS (
  SELECT 'schema'::text AS object_type, n.nspname::text AS schema_name, n.nspname::text AS object_name,
         n.nspowner AS owner_id, n.nspacl AS acl, 'n'::"char" AS default_type
  FROM eligible_namespaces AS n
  UNION ALL
  SELECT CASE WHEN c.relkind = 'S' THEN 'sequence' ELSE 'relation' END,
         n.nspname::text, c.relname::text, c.relowner, c.relacl,
         CASE WHEN c.relkind = 'S' THEN 's'::"char" ELSE 'r'::"char" END
  FROM pg_catalog.pg_class AS c
  JOIN eligible_namespaces AS n ON n.oid = c.relnamespace
  WHERE c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
  UNION ALL
  SELECT 'routine', n.nspname::text,
         p.proname::text || '(' || pg_catalog.pg_get_function_identity_arguments(p.oid) || ')',
         p.proowner, p.proacl, 'f'::"char"
  FROM pg_catalog.pg_proc AS p
  JOIN eligible_namespaces AS n ON n.oid = p.pronamespace
  WHERE p.prokind IN ('f', 'p', 'w')
  UNION ALL
  SELECT 'type', n.nspname::text, t.typname::text, t.typowner, t.typacl, 'T'::"char"
  FROM pg_catalog.pg_type AS t
  JOIN eligible_namespaces AS n ON n.oid = t.typnamespace
  LEFT JOIN pg_catalog.pg_class AS tc ON tc.oid = t.typrelid
  WHERE t.typisdefined
    AND (t.typtype IN ('e', 'd', 'r', 'm') OR (t.typtype = 'c' AND tc.relkind = 'c'))
),
acl_rows AS (
  SELECT jsonb_build_object(
    'canonicalKey', jsonb_build_array('acl', s.object_type, s.schema_name, s.object_name, names.grantor, names.grantee, a.privilege_type, a.is_grantable),
    'objectType', s.object_type,
    'schema', s.schema_name,
    'object', s.object_name,
    'grantor', names.grantor,
    'grantee', names.grantee,
    'privilege', a.privilege_type,
    'grantable', a.is_grantable,
    'usesDefaultAcl', s.acl IS NULL
  ) AS item
  FROM acl_source AS s
  CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(s.acl, pg_catalog.acldefault(s.default_type, s.owner_id))) AS a
  CROSS JOIN LATERAL (
    SELECT
      CASE WHEN a.grantor = 0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantor) END AS grantor,
      CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END AS grantee
  ) AS names
),
owner_rows AS (
  SELECT jsonb_build_object('canonicalKey', jsonb_build_array('owner', 'schema', n.nspname), 'objectType', 'schema', 'schema', n.nspname, 'object', n.nspname, 'owner', pg_catalog.pg_get_userbyid(n.nspowner)) AS item
  FROM eligible_namespaces AS n
  UNION ALL
  SELECT jsonb_build_object('canonicalKey', jsonb_build_array('owner', 'relation', n.nspname, c.relname), 'objectType', 'relation', 'schema', n.nspname, 'object', c.relname, 'owner', pg_catalog.pg_get_userbyid(c.relowner))
  FROM pg_catalog.pg_class AS c JOIN eligible_namespaces AS n ON n.oid = c.relnamespace
  WHERE c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
  UNION ALL
  SELECT jsonb_build_object('canonicalKey', jsonb_build_array('owner', 'routine', n.nspname, p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid)), 'objectType', 'routine', 'schema', n.nspname, 'object', p.proname || '(' || pg_catalog.pg_get_function_identity_arguments(p.oid) || ')', 'owner', pg_catalog.pg_get_userbyid(p.proowner))
  FROM pg_catalog.pg_proc AS p JOIN eligible_namespaces AS n ON n.oid = p.pronamespace
  WHERE p.prokind IN ('f', 'p', 'w')
  UNION ALL
  SELECT jsonb_build_object('canonicalKey', jsonb_build_array('owner', 'type', n.nspname, t.typname), 'objectType', 'type', 'schema', n.nspname, 'object', t.typname, 'owner', pg_catalog.pg_get_userbyid(t.typowner))
  FROM pg_catalog.pg_type AS t
  JOIN eligible_namespaces AS n ON n.oid = t.typnamespace
  LEFT JOIN pg_catalog.pg_class AS tc ON tc.oid = t.typrelid
  WHERE t.typisdefined
    AND (t.typtype IN ('e', 'd', 'r', 'm') OR (t.typtype = 'c' AND tc.relkind = 'c'))
),
default_privilege_rows AS (
  SELECT jsonb_build_object(
    'canonicalKey', jsonb_build_array('default_privilege', pg_catalog.pg_get_userbyid(d.defaclrole), COALESCE(n.nspname, '*'), d.defaclobjtype::text, names.grantor, names.grantee, a.privilege_type, a.is_grantable),
    'owner', pg_catalog.pg_get_userbyid(d.defaclrole),
    'schema', n.nspname,
    'objectType', d.defaclobjtype,
    'grantor', names.grantor,
    'grantee', names.grantee,
    'privilege', a.privilege_type,
    'grantable', a.is_grantable
  ) AS item
  FROM pg_catalog.pg_default_acl AS d
  LEFT JOIN pg_catalog.pg_namespace AS n ON n.oid = d.defaclnamespace
  CROSS JOIN LATERAL pg_catalog.aclexplode(d.defaclacl) AS a
  CROSS JOIN LATERAL (
    SELECT
      CASE WHEN a.grantor = 0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantor) END AS grantor,
      CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END AS grantee
  ) AS names
  WHERE d.defaclnamespace = 0 OR EXISTS (SELECT 1 FROM eligible_namespaces AS e WHERE e.oid = d.defaclnamespace)
),
extension_rows AS (
  SELECT jsonb_build_object(
    'canonicalKey', jsonb_build_array('extension', e.extname),
    'name', e.extname,
    'version', e.extversion,
    'schema', n.nspname,
    'relocatable', e.extrelocatable,
    'owner', pg_catalog.pg_get_userbyid(e.extowner)
  ) AS item
  FROM pg_catalog.pg_extension AS e
  JOIN pg_catalog.pg_namespace AS n ON n.oid = e.extnamespace
),
extension_membership_rows AS (
  SELECT jsonb_build_object(
    'canonicalKey', jsonb_build_array('extension_member', e.extname, ident.type, ident.schema, ident.identity),
    'extension', e.extname,
    'identifiedType', ident.type,
    'schema', ident.schema,
    'name', ident.name,
    'identity', ident.identity
  ) AS item
  FROM pg_catalog.pg_depend AS d
  JOIN pg_catalog.pg_extension AS e
    ON e.oid = d.refobjid
   AND d.refclassid = 'pg_catalog.pg_extension'::pg_catalog.regclass
  CROSS JOIN LATERAL pg_catalog.pg_identify_object(d.classid, d.objid, d.objsubid) AS ident
  WHERE d.deptype = 'e'
),
publication_rows AS (
  SELECT jsonb_build_object(
    'canonicalKey', jsonb_build_array('publication', p.pubname),
    'membershipKind', 'publication',
    'publication', p.pubname,
    'owner', pg_catalog.pg_get_userbyid(p.pubowner),
    'allTables', p.puballtables,
    'insert', p.pubinsert,
    'update', p.pubupdate,
    'delete', p.pubdelete,
    'truncate', p.pubtruncate,
    'viaRoot', p.pubviaroot
  ) AS item
  FROM pg_catalog.pg_publication AS p
  UNION ALL
  SELECT jsonb_build_object(
    'canonicalKey', jsonb_build_array('publication_relation', p.pubname, n.nspname, c.relname),
    'membershipKind', 'relation',
    'publication', p.pubname,
    'schema', n.nspname,
    'relation', c.relname,
    'rowFilter', pg_catalog.pg_get_expr(pr.prqual, pr.prrelid, true),
    'columns', CASE WHEN pr.prattrs IS NULL THEN NULL ELSE (
      SELECT jsonb_agg(a.attname ORDER BY a.attnum)
      FROM unnest(pr.prattrs) AS attribute_number
      JOIN pg_catalog.pg_attribute AS a ON a.attrelid = pr.prrelid AND a.attnum = attribute_number
    ) END
  )
  FROM pg_catalog.pg_publication_rel AS pr
  JOIN pg_catalog.pg_publication AS p ON p.oid = pr.prpubid
  JOIN pg_catalog.pg_class AS c ON c.oid = pr.prrelid
  JOIN eligible_namespaces AS n ON n.oid = c.relnamespace
  UNION ALL
  SELECT jsonb_build_object(
    'canonicalKey', jsonb_build_array('publication_schema', p.pubname, n.nspname),
    'membershipKind', 'schema',
    'publication', p.pubname,
    'schema', n.nspname
  )
  FROM pg_catalog.pg_publication_namespace AS pn
  JOIN pg_catalog.pg_publication AS p ON p.oid = pn.pnpubid
  JOIN eligible_namespaces AS n ON n.oid = pn.pnnspid
),
managed_inventory_source AS (
  SELECT 'relation'::text AS object_kind, item FROM relation_rows
  UNION ALL SELECT 'sequence', item FROM sequence_rows
  UNION ALL SELECT 'column', item FROM column_rows
  UNION ALL SELECT 'type', item FROM type_rows
  UNION ALL SELECT 'constraint', item FROM constraint_rows
  UNION ALL SELECT 'index', item FROM index_rows
  UNION ALL SELECT 'routine', item FROM routine_rows
  UNION ALL SELECT 'trigger', item FROM trigger_rows
  UNION ALL SELECT 'rls', item FROM rls_rows
  UNION ALL SELECT 'policy', item FROM policy_rows
  UNION ALL SELECT 'acl', item FROM acl_rows
  UNION ALL SELECT 'owner', item FROM owner_rows
  UNION ALL SELECT 'publication', item FROM publication_rows
  UNION ALL SELECT 'extension_member', item FROM extension_membership_rows
),
managed_inventory_rows AS (
  SELECT jsonb_build_object(
    'canonicalKey', jsonb_build_array('managed_schema_inventory',
      CASE
        WHEN s.object_kind = 'publication' THEN 'publication_contains_managed_relation'
        WHEN s.object_kind = 'extension_member' THEN 'extension_member_in_managed_schema'
        WHEN s.object_kind IN ('constraint', 'index', 'trigger', 'rls', 'policy', 'acl') THEN 'targets_managed_relation'
        ELSE 'defined_in_managed_schema'
      END,
      s.object_kind
    ) || (s.item -> 'canonicalKey'),
    'reason', CASE
      WHEN s.object_kind = 'publication' THEN 'publication_contains_managed_relation'
      WHEN s.object_kind = 'extension_member' THEN 'extension_member_in_managed_schema'
      WHEN s.object_kind IN ('constraint', 'index', 'trigger', 'rls', 'policy', 'acl') THEN 'targets_managed_relation'
      ELSE 'defined_in_managed_schema'
    END,
    'objectKey', s.item -> 'canonicalKey',
    'managedSchema', s.item ->> 'schema',
    'classification', 'unclassified'
  ) AS item
  FROM managed_inventory_source AS s
  WHERE EXISTS (
    SELECT 1 FROM managed_namespaces AS m WHERE m.name::text = s.item ->> 'schema'
  )
)
SELECT jsonb_build_object(
  'schemaVersion', 1,
  'extractorVersion', 1,
  'serverVersionNum', pg_catalog.current_setting('server_version_num')::integer,
  'transactionReadOnly', pg_catalog.current_setting('transaction_read_only') = 'on',
  'ownershipOverlayStatus', 'pending',
  'sections', jsonb_build_object(
    'schemas', COALESCE((SELECT jsonb_agg(item ORDER BY item -> 'canonicalKey') FROM schema_rows), '[]'::jsonb),
    'relations', COALESCE((SELECT jsonb_agg(item ORDER BY item -> 'canonicalKey') FROM relation_rows), '[]'::jsonb),
    'sequences', COALESCE((SELECT jsonb_agg(item ORDER BY item -> 'canonicalKey') FROM sequence_rows), '[]'::jsonb),
    'columns', COALESCE((SELECT jsonb_agg(item ORDER BY item -> 'canonicalKey') FROM column_rows), '[]'::jsonb),
    'types', COALESCE((SELECT jsonb_agg(item ORDER BY item -> 'canonicalKey') FROM type_rows), '[]'::jsonb),
    'constraints', COALESCE((SELECT jsonb_agg(item ORDER BY item -> 'canonicalKey') FROM constraint_rows), '[]'::jsonb),
    'indexes', COALESCE((SELECT jsonb_agg(item ORDER BY item -> 'canonicalKey') FROM index_rows), '[]'::jsonb),
    'routines', COALESCE((SELECT jsonb_agg(item ORDER BY item -> 'canonicalKey') FROM routine_rows), '[]'::jsonb),
    'triggers', COALESCE((SELECT jsonb_agg(item ORDER BY item -> 'canonicalKey') FROM trigger_rows), '[]'::jsonb),
    'rls', COALESCE((SELECT jsonb_agg(item ORDER BY item -> 'canonicalKey') FROM rls_rows), '[]'::jsonb),
    'policies', COALESCE((SELECT jsonb_agg(item ORDER BY item -> 'canonicalKey') FROM policy_rows), '[]'::jsonb),
    'acl', COALESCE((SELECT jsonb_agg(item ORDER BY item -> 'canonicalKey') FROM acl_rows), '[]'::jsonb),
    'owners', COALESCE((SELECT jsonb_agg(item ORDER BY item -> 'canonicalKey') FROM owner_rows), '[]'::jsonb),
    'defaultPrivileges', COALESCE((SELECT jsonb_agg(item ORDER BY item -> 'canonicalKey') FROM default_privilege_rows), '[]'::jsonb),
    'extensions', COALESCE((SELECT jsonb_agg(item ORDER BY item -> 'canonicalKey') FROM extension_rows), '[]'::jsonb),
    'extensionMemberships', COALESCE((SELECT jsonb_agg(item ORDER BY item -> 'canonicalKey') FROM extension_membership_rows), '[]'::jsonb),
    'publicationMembership', COALESCE((SELECT jsonb_agg(item ORDER BY item -> 'canonicalKey') FROM publication_rows), '[]'::jsonb),
    'managedSchemaInventory', COALESCE((SELECT jsonb_agg(item ORDER BY item -> 'canonicalKey') FROM managed_inventory_rows), '[]'::jsonb),
    'managedSchemaOverlays', '[]'::jsonb
  )
);

COMMIT;

import {
  config,
  validateDatabaseSafety,
  extractDatabaseName,
  selectDatabaseUrl,
  validateNimBaseUrl,
  DEFAULT_NIM_BASE_URL,
  SUPPORTED_DB_PROTOCOLS,
} from '../src/config/env';
import {
  checkPostgresReadiness,
  checkRedisReadiness,
  checkInfrastructureReadiness,
  maskConnectionUrl,
} from '../src/config/readiness';

let totalAssertions = 0;
let passedAssertions = 0;

function assert(condition: boolean, message: string) {
  totalAssertions++;
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  passedAssertions++;
  console.log(`✅ PASSED: ${message}`);
}

async function runStage21Verification() {
  console.log('\n======================================================');
  console.log('🧪 LeetRoot Stage 2.1: Infrastructure & Test Config Suite');
  console.log('======================================================\n');

  // 1. Development Configuration Defaults
  console.log('--- 1. Development Database and Redis Defaults ---');
  assert(typeof config.database.url === 'string', 'Database URL is configured as a string');
  assert(config.database.url.includes('leetroot'), 'Database URL targets leetroot database');
  assert(config.database.port === 5432, 'Default PostgreSQL port is 5432');
  assert(typeof config.redis.url === 'string', 'Redis URL is configured as a string');
  assert(config.redis.url.includes('6379'), 'Redis URL targets port 6379');

  // 2. Dedicated Test Configuration Isolation
  console.log('\n--- 2. Dedicated Test Configuration Isolation ---');
  assert(Boolean(config.testDatabase), 'Dedicated testDatabase configuration is exposed');
  assert(config.testDatabase.url.includes('leetroot_test'), 'Test database URL targets leetroot_test');
  assert(config.testDatabase.db === 'leetroot_test', 'Test database name is leetroot_test');
  assert(Boolean(config.testRedis), 'Dedicated testRedis configuration is exposed');
  assert(config.testRedis.url.includes('/1'), 'Test Redis URL targets dedicated logical DB 1');
  assert(config.testDatabase.url !== config.database.url || config.isTest, 'Test and development database URLs are distinct');
  assert(config.testRedis.url !== config.redis.url || config.isTest, 'Test and development Redis URLs are distinct');

  // 3. Database Name Extraction Robustness & URL Validation Boundaries
  console.log('\n--- 3. Database Name Extraction & Protocol Boundaries ---');
  assert(
    extractDatabaseName('postgresql://leetroot:secret@localhost:5432/leetroot_test') === 'leetroot_test',
    'Extracts db name from standard postgresql URL'
  );
  assert(
    extractDatabaseName('postgres://leetroot:secret@localhost:5432/leetroot_test') === 'leetroot_test',
    'Extracts db name from standard postgres URL'
  );
  assert(
    extractDatabaseName('postgresql://localhost:5432/leetroot_test?sslmode=disable&application_name=test') === 'leetroot_test',
    'Extracts db name ignoring query parameters'
  );
  assert(
    extractDatabaseName('postgresql://localhost:5432/leetroot_test/#frag') === 'leetroot_test',
    'Extracts db name ignoring trailing slashes and hash fragments'
  );
  assert(
    extractDatabaseName('postgresql://localhost:5432/%6ceetroot_test') === 'leetroot_test',
    'Extracts valid percent-encoded database name (%6c -> l)'
  );
  // Focused tests for malformed percent-encoding returning empty string instead of throwing
  assert(
    extractDatabaseName('postgresql://localhost:5432/%ZZ') === '',
    'Malformed percent-encoding (%ZZ) safely returns empty string without throwing'
  );
  assert(
    extractDatabaseName('postgresql://localhost:5432/%') === '',
    'Incomplete percent-encoding (%) safely returns empty string without throwing'
  );
  assert(
    extractDatabaseName('postgresql://localhost:5432/%E0%A4%A') === '',
    'Incomplete multi-byte percent-encoding (%E0%A4%A) safely returns empty string without throwing'
  );
  assert(
    extractDatabaseName('not_a_valid_url') === '',
    'Returns empty string for malformed URL string'
  );
  // Protocol boundaries: non-PostgreSQL URLs return empty string even if path has db name
  assert(
    extractDatabaseName('mysql://localhost:3306/leetroot_test') === '',
    'Rejects MySQL URL protocol, returning empty string'
  );
  assert(
    extractDatabaseName('sqlite:///leetroot_test') === '',
    'Rejects SQLite URL protocol, returning empty string'
  );
  assert(
    extractDatabaseName('http://localhost:5432/leetroot_test') === '',
    'Rejects HTTP URL protocol, returning empty string'
  );
  assert(
    extractDatabaseName('redis://localhost:6379/leetroot_test') === '',
    'Rejects Redis URL protocol, returning empty string'
  );

  // 4. NVIDIA NIM Base URL Validation (Defect 1)
  console.log('\n--- 4. NVIDIA NIM Base URL Validation ---');
  // 4a. Plain valid default assertion
  assert(
    DEFAULT_NIM_BASE_URL === 'https://integrate.api.nvidia.com/v1',
    'DEFAULT_NIM_BASE_URL is exactly the plain URL https://integrate.api.nvidia.com/v1'
  );
  assert(
    config.nim.baseURL === 'https://integrate.api.nvidia.com/v1',
    'config.nim.baseURL resolves to plain URL https://integrate.api.nvidia.com/v1'
  );
  // 4b. Test initialization with an unset NIM URL
  assert(
    validateNimBaseUrl() === 'https://integrate.api.nvidia.com/v1',
    'Calling validateNimBaseUrl() with unset argument returns default plain URL'
  );
  assert(
    validateNimBaseUrl(undefined) === 'https://integrate.api.nvidia.com/v1',
    'Calling validateNimBaseUrl(undefined) returns default plain URL'
  );
  // 4c. Valid plain HTTPS endpoints
  assert(
    validateNimBaseUrl('https://integrate.api.nvidia.com/v1') === 'https://integrate.api.nvidia.com/v1',
    'Accepts standard HTTPS NVIDIA endpoint as a plain URL'
  );
  assert(
    validateNimBaseUrl('https://custom.ai.endpoint:8443/v1') === 'https://custom.ai.endpoint:8443/v1',
    'Accepts valid custom HTTPS endpoint with non-standard port'
  );
  // 4d. Valid plain HTTP endpoints
  assert(
    validateNimBaseUrl('http://localhost:8000/v1') === 'http://localhost:8000/v1',
    'Accepts valid local HTTP endpoint'
  );
  // 4e. Empty and whitespace strings fall back to plain DEFAULT_NIM_BASE_URL
  assert(
    validateNimBaseUrl('') === DEFAULT_NIM_BASE_URL,
    'Empty string safely falls back to plain DEFAULT_NIM_BASE_URL'
  );
  assert(
    validateNimBaseUrl('   ') === DEFAULT_NIM_BASE_URL,
    'Whitespace string safely falls back to plain DEFAULT_NIM_BASE_URL'
  );
  // 4f. Rejection of straightforward Markdown examples including [NVIDIA](https://example.com)
  let markdownErr1: Error | null = null;
  try {
    validateNimBaseUrl('[NVIDIA](https://example.com)');
  } catch (err: any) {
    markdownErr1 = err;
  }
  assert(markdownErr1 !== null, 'Rejects straightforward Markdown example [NVIDIA](https://example.com)');
  assert(
    Boolean(markdownErr1?.message.includes('[CONFIG ERROR] Invalid NVIDIA NIM base URL: Markdown link formatting is not permitted')),
    'Descriptive error for [NVIDIA](https://example.com)'
  );

  let markdownErr2: Error | null = null;
  try {
    validateNimBaseUrl('[https://integrate.api.nvidia.com/v1](https://integrate.api.nvidia.com/v1)');
  } catch (err: any) {
    markdownErr2 = err;
  }
  assert(markdownErr2 !== null, 'Rejects full Markdown link syntax [URL](URL)');

  let markdownErr3: Error | null = null;
  try {
    validateNimBaseUrl('[NVIDIA Base](https://integrate.api.nvidia.com/v1)');
  } catch (err: any) {
    markdownErr3 = err;
  }
  assert(markdownErr3 !== null, 'Rejects labeled Markdown link syntax [Label](URL)');

  // 4g. Rejection of malformed strings and unsupported protocols
  let malformedUrlErr: Error | null = null;
  try {
    validateNimBaseUrl('not_a_valid_url');
  } catch (err: any) {
    malformedUrlErr = err;
  }
  assert(malformedUrlErr !== null, 'Rejects malformed non-URL string');
  assert(Boolean(malformedUrlErr?.message.includes('not a structurally valid URL')), 'Descriptive error for malformed string');

  let unsupportedProtoErr: Error | null = null;
  try {
    validateNimBaseUrl('ftp://api.nvidia.com/v1');
  } catch (err: any) {
    unsupportedProtoErr = err;
  }
  assert(unsupportedProtoErr !== null, 'Rejects unsupported ftp protocol');
  assert(Boolean(unsupportedProtoErr?.message.includes('Unsupported protocol')), 'Descriptive error for unsupported protocol');

  let jsProtoErr: Error | null = null;
  try {
    validateNimBaseUrl('javascript:alert(1)');
  } catch (err: any) {
    jsProtoErr = err;
  }
  assert(jsProtoErr !== null, 'Rejects javascript protocol');

  // 5. Database URL Selection Logic (selectDatabaseUrl)
  console.log('\n--- 5. Database URL Selection Logic (selectDatabaseUrl) ---');
  // 5a. Non-test mode selects dev URL
  assert(
    selectDatabaseUrl(false, undefined, 'postgresql://localhost:5432/custom_dev') === 'postgresql://localhost:5432/custom_dev',
    'Development mode selects DATABASE_URL'
  );
  // 5b. Test mode with absent TEST_DATABASE_URL and dev DATABASE_URL containing query parameters
  const devWithQueryParams = 'postgresql://localhost:5432/leetroot?sslmode=disable';
  assert(
    selectDatabaseUrl(true, undefined, devWithQueryParams, 'leetroot_test', 'postgresql://localhost:5432/leetroot_test') === 'postgresql://localhost:5432/leetroot_test',
    'Test mode with absent TEST_DATABASE_URL safely falls back to default test URL when DATABASE_URL targets dev with query parameters'
  );
  // 5c. Test mode with absent TEST_DATABASE_URL and dev DATABASE_URL containing trailing slash
  const devWithTrailingSlash = 'postgresql://localhost:5432/leetroot/';
  assert(
    selectDatabaseUrl(true, undefined, devWithTrailingSlash, 'leetroot_test', 'postgresql://localhost:5432/leetroot_test') === 'postgresql://localhost:5432/leetroot_test',
    'Test mode with absent TEST_DATABASE_URL safely falls back when DATABASE_URL targets dev with trailing slash'
  );
  // 5d. Test mode with absent TEST_DATABASE_URL and dev DATABASE_URL containing fragment
  const devWithFragment = 'postgresql://localhost:5432/leetroot#frag';
  assert(
    selectDatabaseUrl(true, undefined, devWithFragment, 'leetroot_test', 'postgresql://localhost:5432/leetroot_test') === 'postgresql://localhost:5432/leetroot_test',
    'Test mode with absent TEST_DATABASE_URL safely falls back when DATABASE_URL targets dev with fragment'
  );
  // 5e. Test mode with absent TEST_DATABASE_URL and dev DATABASE_URL containing encoded dev db name
  const devWithEncoded = 'postgresql://localhost:5432/%6ceetroot';
  assert(
    selectDatabaseUrl(true, undefined, devWithEncoded, 'leetroot_test', 'postgresql://localhost:5432/leetroot_test') === 'postgresql://localhost:5432/leetroot_test',
    'Test mode with absent TEST_DATABASE_URL safely falls back when DATABASE_URL targets encoded dev db'
  );
  // 5f. Test mode with absent TEST_DATABASE_URL and dev DATABASE_URL containing test db name as query param
  const devWithQueryParamSpoof = 'postgresql://localhost:5432/leetroot?db=leetroot_test';
  assert(
    selectDatabaseUrl(true, undefined, devWithQueryParamSpoof, 'leetroot_test', 'postgresql://localhost:5432/leetroot_test') === 'postgresql://localhost:5432/leetroot_test',
    'Test mode with absent TEST_DATABASE_URL safely falls back when query param attempts to spoof test db name'
  );
  // 5g. Test mode with absent TEST_DATABASE_URL and malformed percent-encoding in DATABASE_URL
  assert(
    selectDatabaseUrl(true, undefined, 'postgresql://localhost:5432/%ZZ', 'leetroot_test', 'postgresql://localhost:5432/leetroot_test') === 'postgresql://localhost:5432/leetroot_test',
    'Test mode with absent TEST_DATABASE_URL safely falls back when DATABASE_URL has malformed percent-encoding'
  );
  // 5h. Test mode with absent TEST_DATABASE_URL and malformed non-URL string
  assert(
    selectDatabaseUrl(true, undefined, 'not_a_valid_url', 'leetroot_test', 'postgresql://localhost:5432/leetroot_test') === 'postgresql://localhost:5432/leetroot_test',
    'Test mode with absent TEST_DATABASE_URL safely falls back when DATABASE_URL is malformed'
  );
  // 5i. Test mode with absent TEST_DATABASE_URL and legitimate test DATABASE_URL
  const legitTestDbUrl = 'postgresql://localhost:5432/leetroot_test?sslmode=disable';
  assert(
    selectDatabaseUrl(true, undefined, legitTestDbUrl, 'leetroot_test', 'postgresql://localhost:5432/leetroot_test') === legitTestDbUrl,
    'Test mode with absent TEST_DATABASE_URL selects DATABASE_URL when parsed name is exactly testDbName'
  );
  // 5j. Test mode with absent TEST_DATABASE_URL and unsupported scheme DATABASE_URL (e.g. mysql)
  assert(
    selectDatabaseUrl(true, undefined, 'mysql://localhost:3306/leetroot_test', 'leetroot_test', 'postgresql://localhost:5432/leetroot_test') === 'postgresql://localhost:5432/leetroot_test',
    'Test mode with absent TEST_DATABASE_URL falls back to default test URL when DATABASE_URL has unsupported scheme'
  );
  // 5k. Explicit TEST_DATABASE_URL preservation (fail closed contract)
  const unsafeExplicitTestUrl = 'postgresql://localhost:5432/leetroot';
  assert(
    selectDatabaseUrl(true, unsafeExplicitTestUrl, devWithQueryParams, 'leetroot_test') === unsafeExplicitTestUrl,
    'Test mode with explicit TEST_DATABASE_URL preserves explicit URL as-is without replacing with default'
  );
  // 5l. Explicit empty and whitespace TEST_DATABASE_URL must be preserved as-is (NOT silently replaced with default)
  assert(
    selectDatabaseUrl(true, '', devWithQueryParams, 'leetroot_test', 'postgresql://localhost:5432/leetroot_test') === '',
    'Explicit empty string TEST_DATABASE_URL is preserved as empty string without falling back to default'
  );
  assert(
    selectDatabaseUrl(true, '   ', devWithQueryParams, 'leetroot_test', 'postgresql://localhost:5432/leetroot_test') === '   ',
    'Explicit whitespace-only TEST_DATABASE_URL is preserved as whitespace without falling back to default'
  );

  // 6. Strict Database Safety Guard Regression Suite
  console.log('\n--- 6. Strict Database Safety Guard Regression Suite ---');
  // (a) Configured test database is accepted
  let acceptedNoError = true;
  try {
    validateDatabaseSafety('postgresql://leetroot:secret@localhost:5432/leetroot_test', 'test');
  } catch {
    acceptedNoError = false;
  }
  assert(acceptedNoError, 'Regression (a): Configured test database (leetroot_test) is accepted in test mode');

  // Also accept postgres: protocol
  let acceptedPostgresProto = true;
  try {
    validateDatabaseSafety('postgres://leetroot:secret@localhost:5432/leetroot_test', 'test');
  } catch {
    acceptedPostgresProto = false;
  }
  assert(acceptedPostgresProto, 'Regression (a): postgres: protocol URL is accepted for configured test database');

  // (b) Development database is rejected
  let devDbError: Error | null = null;
  try {
    validateDatabaseSafety('postgresql://leetroot:secret@localhost:5432/leetroot', 'test');
  } catch (err: any) {
    devDbError = err;
  }
  assert(devDbError !== null, 'Regression (b): Development database is rejected in test mode');
  assert(
    Boolean(devDbError?.message.includes('[CONFIG ERROR] Unsafe test database configuration')),
    'Regression (b): Development database rejection throws [CONFIG ERROR]'
  );

  // Development database rejection cannot be bypassed by changing POSTGRES_DB
  const origPostgresDb = process.env.POSTGRES_DB;
  let devDbBypassError: Error | null = null;
  try {
    process.env.POSTGRES_DB = 'custom_db';
    validateDatabaseSafety('postgresql://leetroot:secret@localhost:5432/leetroot', 'test');
  } catch (err: any) {
    devDbBypassError = err;
  } finally {
    if (origPostgresDb !== undefined) {
      process.env.POSTGRES_DB = origPostgresDb;
    } else {
      delete process.env.POSTGRES_DB;
    }
  }
  assert(
    devDbBypassError !== null,
    'Regression (b): Setting POSTGRES_DB cannot bypass rejection of default dev database (leetroot)'
  );

  // (c) An unrelated database is rejected
  let unrelatedDbError: Error | null = null;
  try {
    validateDatabaseSafety('postgresql://leetroot:secret@localhost:5432/unrelated_db', 'test');
  } catch (err: any) {
    unrelatedDbError = err;
  }
  assert(unrelatedDbError !== null, 'Regression (c): Unrelated database is rejected in test mode');
  assert(
    Boolean(unrelatedDbError?.message.includes('Unauthorized database for test mode')),
    'Regression (c): Error explicitly states database is unauthorized for test mode'
  );

  // (d) A conflicting TEST_DATABASE_URL is rejected
  const origTestDbUrl = process.env.TEST_DATABASE_URL;
  let conflictingError: Error | null = null;
  try {
    process.env.TEST_DATABASE_URL = 'postgresql://leetroot:secret@localhost:5432/conflicting_db';
    validateDatabaseSafety('postgresql://leetroot:secret@localhost:5432/leetroot_test', 'test');
  } catch (err: any) {
    conflictingError = err;
  } finally {
    if (origTestDbUrl !== undefined) {
      process.env.TEST_DATABASE_URL = origTestDbUrl;
    } else {
      delete process.env.TEST_DATABASE_URL;
    }
  }
  assert(conflictingError !== null, 'Regression (d): Conflicting TEST_DATABASE_URL is rejected');
  assert(
    Boolean(conflictingError?.message.includes('Conflicting TEST_DATABASE_URL')),
    'Regression (d): Throws explicit error identifying conflicting TEST_DATABASE_URL'
  );

  // (e) Malformed TEST_DATABASE_URL is rejected
  let malformedTestDbErr: Error | null = null;
  try {
    process.env.TEST_DATABASE_URL = 'not_a_valid_url';
    validateDatabaseSafety('postgresql://leetroot:secret@localhost:5432/leetroot_test', 'test');
  } catch (err: any) {
    malformedTestDbErr = err;
  } finally {
    if (origTestDbUrl !== undefined) {
      process.env.TEST_DATABASE_URL = origTestDbUrl;
    } else {
      delete process.env.TEST_DATABASE_URL;
    }
  }
  assert(malformedTestDbErr !== null, 'Regression (e): Malformed TEST_DATABASE_URL is rejected');
  assert(
    Boolean(malformedTestDbErr?.message.includes('Malformed TEST_DATABASE_URL')),
    'Regression (e): Throws explicit error identifying malformed TEST_DATABASE_URL'
  );

  // (f) Explicitly configured empty and whitespace TEST_DATABASE_URL fail closed (Requirement 2)
  let explicitEmptyTestDbErr: Error | null = null;
  try {
    process.env.TEST_DATABASE_URL = '';
    validateDatabaseSafety('postgresql://leetroot:secret@localhost:5432/leetroot_test', 'test');
  } catch (err: any) {
    explicitEmptyTestDbErr = err;
  } finally {
    if (origTestDbUrl !== undefined) {
      process.env.TEST_DATABASE_URL = origTestDbUrl;
    } else {
      delete process.env.TEST_DATABASE_URL;
    }
  }
  assert(explicitEmptyTestDbErr !== null, 'Regression (f): Explicitly empty TEST_DATABASE_URL is rejected and fails closed');
  assert(
    Boolean(explicitEmptyTestDbErr?.message.includes('[CONFIG ERROR] Malformed TEST_DATABASE_URL')),
    'Regression (f): Throws descriptive [CONFIG ERROR] for empty TEST_DATABASE_URL'
  );

  let explicitWsTestDbErr: Error | null = null;
  try {
    process.env.TEST_DATABASE_URL = '   ';
    validateDatabaseSafety('postgresql://leetroot:secret@localhost:5432/leetroot_test', 'test');
  } catch (err: any) {
    explicitWsTestDbErr = err;
  } finally {
    if (origTestDbUrl !== undefined) {
      process.env.TEST_DATABASE_URL = origTestDbUrl;
    } else {
      delete process.env.TEST_DATABASE_URL;
    }
  }
  assert(explicitWsTestDbErr !== null, 'Regression (f): Explicitly whitespace TEST_DATABASE_URL is rejected and fails closed');
  assert(
    Boolean(explicitWsTestDbErr?.message.includes('[CONFIG ERROR] Malformed TEST_DATABASE_URL')),
    'Regression (f): Throws descriptive [CONFIG ERROR] for whitespace TEST_DATABASE_URL'
  );

  // Target database URL itself being empty or whitespace must be rejected
  let emptyTargetErr: Error | null = null;
  try {
    validateDatabaseSafety('', 'test');
  } catch (err: any) {
    emptyTargetErr = err;
  }
  assert(emptyTargetErr !== null, 'Regression (f): Explicit empty target database URL is rejected');
  assert(
    Boolean(emptyTargetErr?.message.includes('[CONFIG ERROR] Invalid database URL')),
    'Regression (f): Throws descriptive [CONFIG ERROR] for empty target URL'
  );

  let wsTargetErr: Error | null = null;
  try {
    validateDatabaseSafety('   ', 'test');
  } catch (err: any) {
    wsTargetErr = err;
  }
  assert(wsTargetErr !== null, 'Regression (f): Explicit whitespace target database URL is rejected');

  // Actually absent TEST_DATABASE_URL allows clean execution with valid configured test db
  let absentTestDbSuccess = false;
  try {
    delete process.env.TEST_DATABASE_URL;
    validateDatabaseSafety('postgresql://leetroot:secret@localhost:5432/leetroot_test', 'test');
    absentTestDbSuccess = true;
  } catch {
    absentTestDbSuccess = false;
  } finally {
    if (origTestDbUrl !== undefined) {
      process.env.TEST_DATABASE_URL = origTestDbUrl;
    } else {
      delete process.env.TEST_DATABASE_URL;
    }
  }
  assert(absentTestDbSuccess === true, 'Regression (f): Actually absent TEST_DATABASE_URL allows valid test database');

  // (g) URL Validation Boundaries - Unsupported database protocols (Requirement 3)
  const unsupportedProtocols = [
    { url: 'mysql://localhost:3306/leetroot_test', scheme: 'mysql:' },
    { url: 'sqlite:///leetroot_test', scheme: 'sqlite:' },
    { url: 'http://localhost:5432/leetroot_test', scheme: 'http:' },
    { url: 'redis://localhost:6379/leetroot_test', scheme: 'redis:' },
  ];

  for (const item of unsupportedProtocols) {
    let schemeErr: Error | null = null;
    try {
      validateDatabaseSafety(item.url, 'test');
    } catch (err: any) {
      schemeErr = err;
    }
    assert(schemeErr !== null, 'Regression (g): Unsupported database scheme ' + item.scheme + ' is rejected');
    assert(
      Boolean(schemeErr?.message.includes(`Unsupported database protocol '${item.scheme}'`)),
      'Regression (g): Descriptive error specifies unsupported protocol ' + item.scheme
    );
  }

  // Unsupported database protocol in TEST_DATABASE_URL
  let unsupportedEnvTestDbErr: Error | null = null;
  try {
    process.env.TEST_DATABASE_URL = 'mysql://localhost:3306/leetroot_test';
    validateDatabaseSafety('postgresql://localhost:5432/leetroot_test', 'test');
  } catch (err: any) {
    unsupportedEnvTestDbErr = err;
  } finally {
    if (origTestDbUrl !== undefined) {
      process.env.TEST_DATABASE_URL = origTestDbUrl;
    } else {
      delete process.env.TEST_DATABASE_URL;
    }
  }
  assert(unsupportedEnvTestDbErr !== null, 'Regression (g): TEST_DATABASE_URL with unsupported protocol is rejected');
  assert(
    Boolean(unsupportedEnvTestDbErr?.message.includes('Unsupported database protocol')),
    'Regression (g): Explicit error identifying unsupported protocol in TEST_DATABASE_URL'
  );

  // (h) Safety validator rejects URLs with malformed percent-encoding
  let malformedPercentErr: Error | null = null;
  try {
    validateDatabaseSafety('postgresql://localhost:5432/%ZZ', 'test');
  } catch (err: any) {
    malformedPercentErr = err;
  }
  assert(malformedPercentErr !== null, 'Regression (h): Safety validator rejects URL with malformed percent-encoding (%ZZ)');
  assert(
    Boolean(malformedPercentErr?.message.includes('Invalid database URL: unable to determine target database')),
    'Regression (h): Explicitly rejects because db name cannot be safely extracted'
  );

  let singlePercentErr: Error | null = null;
  try {
    validateDatabaseSafety('postgresql://localhost:5432/%', 'test');
  } catch (err: any) {
    singlePercentErr = err;
  }
  assert(singlePercentErr !== null, 'Regression (h): Safety validator rejects URL with incomplete percent-encoding (%)');

  // (i) Query parameters, fragments, encodings, and trailing slashes do not bypass safety validation
  let queryParamBypassError: Error | null = null;
  try {
    validateDatabaseSafety(
      'postgresql://leetroot:secret@localhost:5432/leetroot?param=leetroot_test&sslmode=disable',
      'test'
    );
  } catch (err: any) {
    queryParamBypassError = err;
  }
  assert(
    queryParamBypassError !== null,
    'Regression (i): Query parameter containing test db name cannot bypass development database rejection'
  );

  let trailingSlashBypassErr: Error | null = null;
  try {
    validateDatabaseSafety('postgresql://leetroot:secret@localhost:5432/leetroot/', 'test');
  } catch (err: any) {
    trailingSlashBypassErr = err;
  }
  assert(trailingSlashBypassErr !== null, 'Regression (i): Trailing slash cannot bypass dev database rejection');

  let encodedBypassErr: Error | null = null;
  try {
    validateDatabaseSafety('postgresql://leetroot:secret@localhost:5432/%6ceetroot', 'test');
  } catch (err: any) {
    encodedBypassErr = err;
  }
  assert(encodedBypassErr !== null, 'Regression (i): Encoded dev db name (%6ceetroot) cannot bypass rejection');

  let fragmentBypassErr: Error | null = null;
  try {
    validateDatabaseSafety('postgresql://leetroot:secret@localhost:5432/leetroot#frag', 'test');
  } catch (err: any) {
    fragmentBypassErr = err;
  }
  assert(fragmentBypassErr !== null, 'Regression (i): Hash fragment cannot bypass dev database rejection');

  let queryParamAccepted = false;
  try {
    validateDatabaseSafety(
      'postgresql://leetroot:secret@localhost:5432/leetroot_test?sslmode=disable&connect_timeout=5',
      'test'
    );
    queryParamAccepted = true;
  } catch {
    queryParamAccepted = false;
  }
  assert(
    queryParamAccepted === true,
    'Regression (i): Legitimate query parameters on configured test database are accepted'
  );

  // 7. Credential Masking Robustness
  console.log('\n--- 7. Credential Masking Robustness ---');
  const maskedPg = maskConnectionUrl('postgresql://leetroot:super_secret_123@localhost:5432/leetroot_test');
  assert(!maskedPg.includes('super_secret_123'), 'maskConnectionUrl masks PostgreSQL password');
  assert(maskedPg.includes('****'), 'maskConnectionUrl replaces PostgreSQL password with ****');

  const maskedRedis = maskConnectionUrl('redis://:redis_secret_pass@localhost:6379/1');
  assert(!maskedRedis.includes('redis_secret_pass'), 'maskConnectionUrl masks Redis password');
  assert(maskedRedis.includes('****'), 'maskConnectionUrl replaces Redis password with ****');

  // 8. Safe Infrastructure Readiness Probes (Resource Cleanup & Bounded Timeouts)
  console.log('\n--- 8. Safe Infrastructure Readiness Probes ---');
  const pgResult = await checkPostgresReadiness(
    'postgresql://leetroot:secret_pass@127.0.0.1:54329/leetroot_test',
    500
  );
  assert(pgResult.ok === false, 'Offline PostgreSQL probe safely returns ok: false');
  assert(typeof pgResult.latencyMs === 'number', 'PostgreSQL probe reports elapsed latency');
  assert(Boolean(pgResult.error), 'PostgreSQL probe captures diagnostic error message: ' + pgResult.error);
  assert(!pgResult.url.includes('secret_pass'), 'PostgreSQL probe masks sensitive credentials in URL: ' + pgResult.url);
  assert(pgResult.database === 'leetroot_test', 'PostgreSQL probe correctly identifies target database name');

  const redisResult = await checkRedisReadiness(
    'redis://:secret_token@127.0.0.1:63799/1',
    500
  );
  assert(redisResult.ok === false, 'Offline Redis probe safely returns ok: false');
  assert(typeof redisResult.latencyMs === 'number', 'Redis probe reports elapsed latency');
  assert(Boolean(redisResult.error), 'Redis probe captures diagnostic error message: ' + redisResult.error);
  assert(!redisResult.url.includes('secret_token'), 'Redis probe masks sensitive credentials in URL: ' + redisResult.url);

  const combined = await checkInfrastructureReadiness({
    postgresUrl: 'postgresql://leetroot:pw@127.0.0.1:54329/leetroot_test',
    redisUrl: 'redis://127.0.0.1:63799/1',
    timeoutMs: 500,
  });
  assert(combined.allReady === false, 'Combined readiness check accurately reports allReady: false when offline');
  assert(combined.postgres.ok === false, 'Combined check accurately includes postgres status');
  assert(combined.redis.ok === false, 'Combined check accurately includes redis status');

  console.log(`\n🎉 STAGE 2.1 REFINEMENTS: ALL ${passedAssertions}/${totalAssertions} ASSERTIONS PASSED!\n`);
}

runStage21Verification().catch((err) => {
  console.error('Stage 2.1 verification test failed:', err);
  process.exit(1);
});

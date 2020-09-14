import { expect } from "chai";
import chaiAsPromised from "chai-as-promised";
import sinon from "sinon";
import {
    AUTHENTICATION_RESULT,
    DEFAULT_OPENID_CONFIG_RESPONSE,
    TEST_CONFIG,
    TEST_DATA_CLIENT_INFO,
    ID_TOKEN_CLAIMS,
    TEST_TOKENS
} from "../utils/StringConstants";
import { BaseClient } from "../../src/client/BaseClient";
import { AADServerParamKeys, Constants, CredentialType, GrantType } from "../../src/utils/Constants";
import { ClientTestUtils, MockStorageClass } from "./ClientTestUtils";
import { Authority } from "../../src/authority/Authority";
import { SilentFlowClient } from "../../src/client/SilentFlowClient";
import { RefreshTokenClient } from "../../src/client/RefreshTokenClient";
import { AuthenticationResult } from "../../src/response/AuthenticationResult";
import { AccountInfo } from "../../src/account/AccountInfo";
import { SilentFlowRequest, AccountEntity, IdTokenEntity, AccessTokenEntity, RefreshTokenEntity, CacheManager, ClientConfigurationErrorMessage, ClientAuthErrorMessage, TimeUtils, ClientConfiguration, RefreshTokenRequest, ServerTelemetryManager, TokenClaims } from "../../src";
import { AuthToken } from "../../src/account/AuthToken";

const testAccountEntity: AccountEntity = new AccountEntity();
testAccountEntity.homeAccountId = `${TEST_DATA_CLIENT_INFO.TEST_UID}.${TEST_DATA_CLIENT_INFO.TEST_UTID}`;
testAccountEntity.localAccountId = "testId";
testAccountEntity.environment = "login.windows.net";
testAccountEntity.realm = ID_TOKEN_CLAIMS.tid;
testAccountEntity.username = ID_TOKEN_CLAIMS.preferred_username;
testAccountEntity.authorityType = "MSSTS";

const testIdToken: IdTokenEntity = new IdTokenEntity();
testIdToken.homeAccountId = `${TEST_DATA_CLIENT_INFO.TEST_UID}.${TEST_DATA_CLIENT_INFO.TEST_UTID}`;
testIdToken.clientId = TEST_CONFIG.MSAL_CLIENT_ID;
testIdToken.environment = testAccountEntity.environment;
testIdToken.realm = ID_TOKEN_CLAIMS.tid;
testIdToken.secret = AUTHENTICATION_RESULT.body.id_token;
testIdToken.credentialType = CredentialType.ID_TOKEN;

const testAccessTokenEntity: AccessTokenEntity = new AccessTokenEntity();
testAccessTokenEntity.homeAccountId = `${TEST_DATA_CLIENT_INFO.TEST_UID}.${TEST_DATA_CLIENT_INFO.TEST_UTID}`;
testAccessTokenEntity.clientId = TEST_CONFIG.MSAL_CLIENT_ID;
testAccessTokenEntity.environment = testAccountEntity.environment;
testAccessTokenEntity.realm = ID_TOKEN_CLAIMS.tid;
testAccessTokenEntity.secret = AUTHENTICATION_RESULT.body.access_token;
testAccessTokenEntity.target = TEST_CONFIG.DEFAULT_GRAPH_SCOPE.join(" ");
testAccessTokenEntity.credentialType = CredentialType.ACCESS_TOKEN;

const testRefreshTokenEntity: RefreshTokenEntity = new RefreshTokenEntity();
testRefreshTokenEntity.homeAccountId = `${TEST_DATA_CLIENT_INFO.TEST_UID}.${TEST_DATA_CLIENT_INFO.TEST_UTID}`;
testRefreshTokenEntity.clientId = TEST_CONFIG.MSAL_CLIENT_ID;
testRefreshTokenEntity.environment = testAccountEntity.environment;
testRefreshTokenEntity.realm = ID_TOKEN_CLAIMS.tid;
testRefreshTokenEntity.secret = AUTHENTICATION_RESULT.body.refresh_token;
testRefreshTokenEntity.credentialType = CredentialType.REFRESH_TOKEN;

describe("SilentFlowClient unit tests", () => {
    beforeEach(() => {
        ClientTestUtils.setCloudDiscoveryMetadataStubs();
    });
    
    afterEach(() => {
        sinon.restore();
    });

    describe("Constructor", async () => {
        it("creates a SilentFlowClient", async () => {
            sinon.stub(Authority.prototype, <any>"discoverEndpoints").resolves(DEFAULT_OPENID_CONFIG_RESPONSE);
            const config = await ClientTestUtils.createTestClientConfiguration();
            const client = new SilentFlowClient(config);
            expect(client).to.be.not.null;
            expect(client instanceof SilentFlowClient).to.be.true;
            expect(client instanceof BaseClient).to.be.true;
        });
    });

    describe("Error cases", () => {
        const testAccount: AccountInfo = {
            homeAccountId: TEST_DATA_CLIENT_INFO.TEST_HOME_ACCOUNT_ID,
            environment: "login.windows.net",
            tenantId: "testTenantId",
            username: "testname@contoso.com"
        };

        it("Throws error if account is not included in request object", async () => {
            sinon.stub(Authority.prototype, <any>"discoverEndpoints").resolves(DEFAULT_OPENID_CONFIG_RESPONSE);
            const config = await ClientTestUtils.createTestClientConfiguration();
            const client = new SilentFlowClient(config);
            await expect(client.acquireToken({
                scopes: TEST_CONFIG.DEFAULT_GRAPH_SCOPE,
                account: null
            })).to.be.rejectedWith(ClientAuthErrorMessage.NoAccountInSilentRequest.desc);
            await expect(client.acquireCachedToken({
                scopes: TEST_CONFIG.DEFAULT_GRAPH_SCOPE,
                account: null
            })).to.be.rejectedWith(ClientAuthErrorMessage.NoAccountInSilentRequest.desc);
        });

        it("Throws error if request object is null or undefined", async () => {
            sinon.stub(Authority.prototype, <any>"discoverEndpoints").resolves(DEFAULT_OPENID_CONFIG_RESPONSE);
            const config = await ClientTestUtils.createTestClientConfiguration();
            const client = new SilentFlowClient(config);
            await expect(client.acquireToken(null)).to.be.rejectedWith(ClientConfigurationErrorMessage.tokenRequestEmptyError.desc);
            await expect(client.acquireToken(undefined)).to.be.rejectedWith(ClientConfigurationErrorMessage.tokenRequestEmptyError.desc);
            await expect(client.acquireCachedToken(null)).to.be.rejectedWith(ClientConfigurationErrorMessage.tokenRequestEmptyError.desc);
            await expect(client.acquireCachedToken(undefined)).to.be.rejectedWith(ClientConfigurationErrorMessage.tokenRequestEmptyError.desc);
        });

        it("Throws error if scopes are not included in request object", async () => {
            sinon.stub(Authority.prototype, <any>"discoverEndpoints").resolves(DEFAULT_OPENID_CONFIG_RESPONSE);
            const config = await ClientTestUtils.createTestClientConfiguration();
            const client = new SilentFlowClient(config);
            await expect(client.acquireToken({
                scopes: null,
                account: testAccount
            })).to.be.rejectedWith(ClientConfigurationErrorMessage.emptyScopesError.desc);
        });

        it("Throws error if scopes are empty in request object", async () => {
            const tokenRequest: SilentFlowRequest = {
                scopes: [],
                account: testAccount
            };
            sinon.stub(Authority.prototype, <any>"discoverEndpoints").resolves(DEFAULT_OPENID_CONFIG_RESPONSE);
            const config = await ClientTestUtils.createTestClientConfiguration();
            const client = new SilentFlowClient(config);
            await expect(client.acquireToken(tokenRequest)).to.be.rejectedWith(ClientConfigurationErrorMessage.emptyScopesError.desc);
        });
    });

    describe("acquireToken tests", () => {
        let config: ClientConfiguration;
        let client: SilentFlowClient;
        const testAccount: AccountInfo = {
            homeAccountId: `${TEST_DATA_CLIENT_INFO.TEST_UID}.${TEST_DATA_CLIENT_INFO.TEST_UTID}`,
            tenantId: ID_TOKEN_CLAIMS.tid,
            environment: "login.windows.net",
            username: ID_TOKEN_CLAIMS.preferred_username
        };
        
        beforeEach(async () => {
            sinon.stub(Authority.prototype, <any>"discoverEndpoints").resolves(DEFAULT_OPENID_CONFIG_RESPONSE);
            AUTHENTICATION_RESULT.body.client_info = TEST_DATA_CLIENT_INFO.TEST_DECODED_CLIENT_INFO;
            sinon.stub(RefreshTokenClient.prototype, <any>"executePostToTokenEndpoint").resolves(AUTHENTICATION_RESULT);
            sinon.stub(AuthToken, "extractTokenClaims").returns(ID_TOKEN_CLAIMS);
            sinon.stub(CacheManager.prototype, "getAccount").returns(testAccountEntity);
            sinon.stub(CacheManager.prototype, "getIdTokenEntity").returns(testIdToken);
            sinon.stub(CacheManager.prototype, "getAccessTokenEntity").returns(testAccessTokenEntity);
            sinon.stub(CacheManager.prototype, "getRefreshTokenEntity").returns(testRefreshTokenEntity);

            config = await ClientTestUtils.createTestClientConfiguration();
            client = new SilentFlowClient(config);
        });

        afterEach(() => {
            sinon.restore();
        });

        it("acquireToken returns token from cache", async () => {
            const silentFlowRequest: SilentFlowRequest = {
                scopes: TEST_CONFIG.DEFAULT_GRAPH_SCOPE,
                account: testAccount
            };

            sinon.stub(TimeUtils, <any>"isTokenExpired").returns(false);
            const refreshTokenSpy = sinon.stub(RefreshTokenClient.prototype, "acquireToken");

            const authResult = await client.acquireToken(silentFlowRequest);
            expect(refreshTokenSpy.called).to.be.false;
            const expectedScopes = [TEST_CONFIG.DEFAULT_GRAPH_SCOPE[0]];
            expect(authResult.uniqueId).to.deep.eq(ID_TOKEN_CLAIMS.oid);
            expect(authResult.tenantId).to.deep.eq(ID_TOKEN_CLAIMS.tid);
            expect(authResult.scopes).to.deep.eq(expectedScopes);
            expect(authResult.account).to.deep.eq(testAccount);
            expect(authResult.idToken).to.deep.eq(testIdToken.secret);
            expect(authResult.idTokenClaims).to.deep.eq(ID_TOKEN_CLAIMS);
            expect(authResult.accessToken).to.deep.eq(testAccessTokenEntity.secret);
            expect(authResult.state).to.be.empty;
        });

        it("acquireToken calls refreshToken if refresh is required", async () => {
            const silentFlowRequest: SilentFlowRequest = {
                scopes: TEST_CONFIG.DEFAULT_GRAPH_SCOPE,
                account: testAccount
            };

            const expectedRefreshRequest: RefreshTokenRequest = {
                ...silentFlowRequest,
                refreshToken: testRefreshTokenEntity.secret
            };

            sinon.stub(SilentFlowClient.prototype, <any>"isRefreshRequired").returns(true);
            const refreshTokenClientSpy = sinon.stub(RefreshTokenClient.prototype, "acquireToken");
            
            await client.acquireToken(silentFlowRequest);
            expect(refreshTokenClientSpy.called).to.be.true;
            expect(refreshTokenClientSpy.calledWith(expectedRefreshRequest)).to.be.true;
        });
    
        it("acquireCachedToken returns cached token", async () => {
            config.serverTelemetryManager = new ServerTelemetryManager({
                clientId: TEST_CONFIG.MSAL_CLIENT_ID,
                apiId: 862,
                correlationId: "test-correlation-id"
            }, null);
            client = new SilentFlowClient(config);
            const telemetryCacheHitSpy = sinon.stub(ServerTelemetryManager.prototype, "incrementCacheHits").returns(1);
            sinon.stub(TimeUtils, <any>"isTokenExpired").returns(false);

            const silentFlowRequest: SilentFlowRequest = {
                scopes: TEST_CONFIG.DEFAULT_GRAPH_SCOPE,
                account: testAccount,
                forceRefresh: false
            };
            
            const authResult: AuthenticationResult = await client.acquireCachedToken(silentFlowRequest);
            const expectedScopes = [TEST_CONFIG.DEFAULT_GRAPH_SCOPE[0]];
            expect(telemetryCacheHitSpy.calledOnce).to.be.true;
            expect(authResult.uniqueId).to.deep.eq(ID_TOKEN_CLAIMS.oid);
            expect(authResult.tenantId).to.deep.eq(ID_TOKEN_CLAIMS.tid);
            expect(authResult.scopes).to.deep.eq(expectedScopes);
            expect(authResult.account).to.deep.eq(testAccount);
            expect(authResult.idToken).to.deep.eq(testIdToken.secret);
            expect(authResult.idTokenClaims).to.deep.eq(ID_TOKEN_CLAIMS);
            expect(authResult.accessToken).to.deep.eq(testAccessTokenEntity.secret);
            expect(authResult.state).to.be.empty;
        });

        it("acquireCachedToken throws refresh requiredError if forceRefresh set to true", async () => {
            const config = await ClientTestUtils.createTestClientConfiguration();
            const client = new SilentFlowClient(config);
            sinon.stub(TimeUtils, <any>"isTokenExpired").returns(false);

            const silentFlowRequest: SilentFlowRequest = {
                scopes: TEST_CONFIG.DEFAULT_GRAPH_SCOPE,
                account: testAccount,
                forceRefresh: true
            };
            
            await expect(client.acquireCachedToken(silentFlowRequest)).to.be.rejectedWith(ClientAuthErrorMessage.tokenRefreshRequired.desc);
        });

        it("acquireCachedToken throws refresh requiredError if claims included on request", async () => {
            const config = await ClientTestUtils.createTestClientConfiguration();
            const client = new SilentFlowClient(config);
            sinon.stub(TimeUtils, <any>"isTokenExpired").returns(false);

            const silentFlowRequest: SilentFlowRequest = {
                scopes: TEST_CONFIG.DEFAULT_GRAPH_SCOPE,
                account: testAccount,
                forceRefresh: false,
                claims: TEST_CONFIG.CLAIMS
            };
            
            await expect(client.acquireCachedToken(silentFlowRequest)).to.be.rejectedWith(ClientAuthErrorMessage.tokenRefreshRequired.desc);
        });

        it("acquireCachedToken throws refresh requiredError if access token is expired", async () => {
            const config = await ClientTestUtils.createTestClientConfiguration();
            const client = new SilentFlowClient(config);
            sinon.stub(TimeUtils, "isTokenExpired").returns(true);

            const silentFlowRequest: SilentFlowRequest = {
                scopes: TEST_CONFIG.DEFAULT_GRAPH_SCOPE,
                account: testAccount,
                forceRefresh: false
            };
            
            await expect(client.acquireCachedToken(silentFlowRequest)).to.be.rejectedWith(ClientAuthErrorMessage.tokenRefreshRequired.desc);
        });

        it("acquireCachedToken throws refresh requiredError if no access token is cached", async () => {
            sinon.restore();
            ClientTestUtils.setCloudDiscoveryMetadataStubs();
            sinon.stub(Authority.prototype, <any>"discoverEndpoints").resolves(DEFAULT_OPENID_CONFIG_RESPONSE);
            AUTHENTICATION_RESULT.body.client_info = TEST_DATA_CLIENT_INFO.TEST_DECODED_CLIENT_INFO;
            sinon.stub(RefreshTokenClient.prototype, <any>"executePostToTokenEndpoint").resolves(AUTHENTICATION_RESULT);
            sinon.stub(AuthToken, "extractTokenClaims").returns(ID_TOKEN_CLAIMS);
            sinon.stub(CacheManager.prototype, "getAccount").returns(testAccountEntity);
            sinon.stub(CacheManager.prototype, "getIdTokenEntity").returns(testIdToken);
            sinon.stub(CacheManager.prototype, "getAccessTokenEntity").returns(null);
            sinon.stub(CacheManager.prototype, "getRefreshTokenEntity").returns(testRefreshTokenEntity);
            const config = await ClientTestUtils.createTestClientConfiguration();
            const client = new SilentFlowClient(config);
            sinon.stub(TimeUtils, <any>"isTokenExpired").returns(false);

            const silentFlowRequest: SilentFlowRequest = {
                scopes: TEST_CONFIG.DEFAULT_GRAPH_SCOPE,
                account: testAccount,
                forceRefresh: false
            };
            
            await expect(client.acquireCachedToken(silentFlowRequest)).to.be.rejectedWith(ClientAuthErrorMessage.tokenRefreshRequired.desc);
        });
    });
});

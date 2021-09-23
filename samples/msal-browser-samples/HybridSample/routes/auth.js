var express = require('express');
var router = express.Router();
var path = require('path');

const msalInstance = require('./msal');

const dotenv = require("dotenv");
dotenv.config();

router.use('/lib', express.static(path.join(__dirname, '../node_modules/@azure/msal-browser/lib')));

router.get('/login', (req, res) => {
    const authCodeUrlParameters = {
        scopes: ["user.read"],
        redirectUri: "http://localhost:3000/auth/server-redirect",
        responseMode: "form_post"
    };

    if (req.query.hybrid) {
        authCodeUrlParameters.state = "hybrid=true";
    } else if (req.query.implicit) {
        authCodeUrlParameters.state = "implicit=true"
    }

    // get url to sign user in and consent to scopes needed for application
    msalInstance.getAuthCodeUrl(authCodeUrlParameters)
        .then((response) => {
            console.log(response);
            res.redirect(response);
        })
        .catch((error) => console.log(JSON.stringify(error)));
});

router.post('/server-redirect', (req, res) => {
    const tokenRequest = {
        code: req.body.code,
        scopes: ["user.read"],
        redirectUri: "http://localhost:3000/auth/server-redirect"
    };

    const useHybrid = req.body.state === "hybrid=true";
    const useImplicit = req.body.state === "implicit=true";

    // Parameters needed to spa test flight
    tokenRequest.tokenQueryParameters = {
        dc: "ESTS-PUB-WUS2-AZ1-FD000-TEST1",
        hybridspa: "true"
    }

    if (useHybrid) {
        console.log('Hybrid enabled');
        tokenRequest.returnSpaCode = true
        // tokenRequest.tokenBodyParameters = {
        //     return_spa_code: "1"
        // }
    } else {
        console.log('Hybrid disabled');
    }

    const timeLabel = "Time for acquireTokenByCode";
    console.time(timeLabel)

    msalInstance.acquireTokenByCode(tokenRequest)
        .then((response) => {
            console.timeEnd(timeLabel)
            console.log("Response: ", response);

            const {
                sid, // Session ID claim, used for non-hybrid
                login_hint: loginHint, // New login_hint claim (used instead of sid or email)
                preferred_username: preferredUsername // Email
            } = response.idTokenClaims;

            // Spa auth code
            const { code } = response;

            req.session.isAuthenticated = true;
            req.session.code = code;
            req.session.sid = sid;
            req.session.loginHint = loginHint;
            req.session.preferredUsername = preferredUsername;

            if (useImplicit) {
                res.redirect(`/auth/implicit-redirect`)
            } else {
                res.redirect(`/auth/client-redirect`)
            }
        })
        .catch((error) => {
            console.timeEnd(timeLabel)
            console.log(error);
            res.status(500).send(error);
        });
});

const data = {
    title: 'MSAL Hybrid Sample App',
    clientId: process.env.MSAL_CLIENT_ID
}

router.get('/client-redirect', function(req, res, next) {
    res.render('client-redirect', {
        ...data,
        ...req.session
    });
});

router.get('/implicit-redirect', function(req, res, next) {
    res.render('implicit-redirect', {
        ...data,
        ...req.session
    });
});

router.get('/logout', (req, res) => {
    req.session.destroy(err => {
        res.render('logout', data);
    })
});

module.exports = router;

// server.js

const express = require("express");
const axios = require("axios");
const cors = require("cors");
const archiver = require("archiver");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;


/* ==========================================================================
   DISCORD LOGIN
   ========================================================================== */

app.get("/auth/discord", (req, res) => {

    const url =
        `https://discord.com/oauth2/authorize` +
        `?client_id=${CLIENT_ID}` +
        `&response_type=code` +
        `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
        `&scope=identify`;

    res.redirect(url);

});


/* ==========================================================================
   DISCORD CALLBACK
   ========================================================================== */

app.get("/auth/discord/callback", async (req, res) => {

    const code = req.query.code;

    if (!code) {
        return res.status(400).send("Missing Discord authorization code.");
    }

    try {

        const tokenRes = await axios.post(
            "https://discord.com/api/oauth2/token",

            new URLSearchParams({
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
                grant_type: "authorization_code",
                code: code,
                redirect_uri: REDIRECT_URI
            }),

            {
                headers: {
                    "Content-Type":
                        "application/x-www-form-urlencoded"
                }
            }
        );

        const accessToken =
            tokenRes.data.access_token;

        const userRes = await axios.get(
            "https://discord.com/api/users/@me",

            {
                headers: {
                    Authorization:
                        `Bearer ${accessToken}`
                }
            }
        );

        const user = userRes.data;

        res.redirect(
            `https://riglify.github.io/` +
            `?username=${encodeURIComponent(user.username)}` +
            `&avatar=${encodeURIComponent(user.avatar || "")}` +
            `&id=${encodeURIComponent(user.id)}`
        );

    } catch (err) {

        console.error(
            "DISCORD OAUTH ERROR:",
            err.response?.data || err.message
        );

        res.status(500).send(
            "Discord login failed."
        );

    }

});


/* ==========================================================================
   ROBLOX AVATAR FETCHER
   ========================================================================== */

app.get("/avatar/:identifier", async (req, res) => {

    const identifier =
        String(req.params.identifier || "").trim();

    if (!identifier) {

        return res.status(400).json({
            success: false,
            error: "Missing Roblox username or user ID."
        });

    }

    try {

        let userId;
        let username;

        /*
        ----------------------------------------------------------------------
        IF THE IDENTIFIER IS A NUMBER:
        Treat it as a Roblox user ID.
        ----------------------------------------------------------------------
        */

        if (/^\d+$/.test(identifier)) {

            userId = identifier;

            const userResponse =
                await axios.get(
                    `https://users.roblox.com/v1/users/${userId}`
                );

            username =
                userResponse.data.name;

        }

        /*
        ----------------------------------------------------------------------
        IF THE IDENTIFIER IS TEXT:
        Treat it as a Roblox username.
        ----------------------------------------------------------------------
        */

        else {

            const userLookup =
                await axios.post(

                    "https://users.roblox.com/v1/usernames/users",

                    {
                        usernames: [identifier],
                        excludeBannedUsers: false
                    },

                    {
                        headers: {
                            "Content-Type":
                                "application/json"
                        }
                    }

                );

            const foundUser =
                userLookup.data.data?.[0];

            if (!foundUser) {

                return res.status(404).json({

                    success: false,

                    error:
                        "Roblox user not found."

                });

            }

            userId =
                String(foundUser.id);

            username =
                foundUser.name;

        }


        /*
        ----------------------------------------------------------------------
        GET ROBLOX AVATAR THUMBNAIL
        ----------------------------------------------------------------------
        */

        const thumbnailResponse =
            await axios.get(

                "https://thumbnails.roblox.com/v1/users/avatar",

                {
                    params: {

                        userIds: userId,

                        size: "720x720",

                        format: "Png",

                        isCircular: false

                    }

                }

            );

        const thumbnail =
            thumbnailResponse
                .data
                ?.data?.[0]
                ?.imageUrl;


        /*
        ----------------------------------------------------------------------
        GET ROBLOX WORN ASSETS
        ----------------------------------------------------------------------
        */

        let assets = [];

        try {

            const avatarResponse =
                await axios.get(

                    `https://avatar.roblox.com/v1/users/${userId}/currently-wearing`

                );

            const wornAssets =
                avatarResponse
                    .data
                    ?.assetIds || [];

            assets =
                wornAssets.map(
                    (assetId) => ({

                        id:
                            String(assetId),

                        name:
                            `Roblox Asset ${assetId}`,

                        image:
                            `https://www.roblox.com/asset-thumbnail/image?assetId=${assetId}&width=420&height=420&format=png`,

                        assetType:
                            "Asset"

                    })
                );

        } catch (assetError) {

            console.warn(

                "Could not load worn assets:",

                assetError.response?.data ||
                assetError.message

            );

        }


        /*
        ----------------------------------------------------------------------
        SEND AVATAR DATA TO THE FRONTEND
        ----------------------------------------------------------------------
        */

        return res.json({

            success: true,

            userId: userId,

            username: username,

            thumbnail:
                thumbnail || "",

            assets: assets

        });

    } catch (err) {

        console.error(
            "AVATAR FETCH ERROR:",
            err.response?.data || err.message
        );

        return res.status(500).json({

            success: false,

            error:
                "Failed to retrieve Roblox avatar."

        });

    }

});


/* ==========================================================================
   RIGLIFY DOWNLOAD SYSTEM
   ========================================================================== */

app.get("/download/:id", async (req, res) => {

    const assetId =
        String(req.params.id || "");

    const targetUserId =
        String(req.query.userId || "");

    try {

        /*
        ======================================================================
        OBJ ZIP EXPORT
        ======================================================================
        */

        if (assetId === "all_obj") {

            if (!targetUserId) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Missing Roblox user ID."

                });

            }

            console.log(

                `Starting OBJ export for Roblox user ${targetUserId}`

            );


            /*
            ------------------------------------------------------------------
            GET USER INFORMATION
            ------------------------------------------------------------------
            */

            const avatarResponse =
                await axios.get(

                    `http://127.0.0.1:${PORT}/avatar/${targetUserId}`

                );

            const avatarData =
                avatarResponse.data;


            if (
                !avatarData ||
                !avatarData.success
            ) {

                throw new Error(

                    "Could not retrieve avatar data."

                );

            }


            /*
            ------------------------------------------------------------------
            CREATE ZIP
            ------------------------------------------------------------------
            */

            const archive =
                archiver(

                    "zip",

                    {
                        zlib: {
                            level: 9
                        }
                    }

                );


            res.attachment(

                `Riglify_${avatarData.username}_obj.zip`

            );


            archive.on(

                "error",

                (error) => {

                    console.error(

                        "ZIP ARCHIVE ERROR:",

                        error

                    );

                    if (!res.headersSent) {

                        res.status(500).end();

                    }

                }

            );


            archive.pipe(res);


            /*
            ------------------------------------------------------------------
            TEMPORARY OBJ PLACEHOLDER
            ------------------------------------------------------------------
            */

            const objContent =

`# Riglify Roblox Avatar Export
# Username: ${avatarData.username}
# User ID: ${avatarData.userId}

# This is a temporary OBJ placeholder.
# Full Roblox avatar conversion is coming soon.
`;


            archive.append(

                objContent,

                {

                    name:
                        `${avatarData.username}.obj`

                }

            );


            /*
            ------------------------------------------------------------------
            EXPORT INFORMATION
            ------------------------------------------------------------------
            */

            const exportInfo =

`Riglify Avatar Export

Username:
${avatarData.username}

Roblox User ID:
${avatarData.userId}

Export Format:
OBJ

Status:
Preview export

The full avatar conversion engine
is currently under development.
`;


            archive.append(

                exportInfo,

                {

                    name:
                        "README.txt"

                }

            );


            /*
            ------------------------------------------------------------------
            FINISH ZIP
            ------------------------------------------------------------------
            */

            await archive.finalize();


            console.log(

                `OBJ ZIP created for ${avatarData.username}`

            );

            return;

        }


        /*
        ======================================================================
        INDIVIDUAL ROBLOX ASSET DOWNLOAD
        ======================================================================
        */

        if (
            !assetId ||
            !/^\d+$/.test(assetId)
        ) {

            return res.status(400).json({

                success: false,

                error:
                    "Invalid Roblox asset ID."

            });

        }


        const assetUrl =

            `https://assetdelivery.roproxy.com/v1/asset/?id=${assetId}`;


        console.log(

            `Downloading Roblox asset ${assetId}`

        );


        const assetResponse =
            await axios.get(

                assetUrl,

                {

                    responseType:
                        "stream",

                    headers: {

                        "User-Agent":
                            "Mozilla/5.0"

                    }

                }

            );


        res.setHeader(

            "Content-Type",

            "application/octet-stream"

        );


        res.setHeader(

            "Content-Disposition",

            `attachment; filename="Riglify_Asset_${assetId}.rbxm"`

        );


        return assetResponse
            .data
            .pipe(res);


    } catch (err) {

        console.error(

            "========== DOWNLOAD FAILURE =========="

        );


        console.error(

            err.response?.data ||
            err.message

        );


        if (!res.headersSent) {

            return res.status(500).json({

                success: false,

                error:
                    "Download failed."

            });

        }

    }

});


/* ==========================================================================
   GITHUB LOGIN
   ========================================================================== */

app.get("/auth/github", (req, res) => {

    const url =

        `https://github.com/login/oauth/authorize` +

        `?client_id=${process.env.GITHUB_CLIENT_ID}` +

        `&scope=read:user%20user:email`;


    res.redirect(url);

});


/* ==========================================================================
   GITHUB CALLBACK
   ========================================================================== */

app.get(
    "/auth/github/callback",

    async (req, res) => {

        const code =
            req.query.code;


        if (!code) {

            return res.status(400).send(

                "Missing GitHub authorization code."

            );

        }


        try {

            const tokenRes =
                await axios.post(

                    "https://github.com/login/oauth/access_token",

                    {

                        client_id:
                            process.env.GITHUB_CLIENT_ID,

                        client_secret:
                            process.env.GITHUB_CLIENT_SECRET,

                        code: code

                    },

                    {

                        headers: {

                            Accept:
                                "application/json"

                        }

                    }

                );


            const accessToken =
                tokenRes.data.access_token;


            const userRes =
                await axios.get(

                    "https://api.github.com/user",

                    {

                        headers: {

                            Authorization:
                                `Bearer ${accessToken}`

                        }

                    }

                );


            const user =
                userRes.data;


            res.redirect(

                `https://riglify.github.io/` +

                `?github=${encodeURIComponent(user.login)}` +

                `&avatar=${encodeURIComponent(user.avatar_url)}`

            );


        } catch (err) {

            console.error(

                "GITHUB OAUTH ERROR:",

                err.response?.data ||
                err.message

            );


            res.status(500).send(

                "GitHub login failed."

            );

        }

    }

);


/* ==========================================================================
   HEALTH CHECK
   ========================================================================== */

app.get("/", (req, res) => {

    res.json({

        success: true,

        service:
            "Riglify Backend",

        status:
            "Online"

    });

});


/* ==========================================================================
   START SERVER
   ========================================================================== */

const PORT =
    process.env.PORT || 10000;


app.listen(

    PORT,

    () => {

        console.log(

            `Riglify server running on port ${PORT}`

        );

    }

);



// RIGLIFY BACKEND - COPYRIGHT © 2026 BY NOTHINGBUTTYLER.
// ALL RIGHTS RESERVED.

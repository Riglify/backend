// server.js

const express = require("express");
const axios = require("axios");
const cors = require("cors");
const archiver = require("archiver");
require("dotenv").config();

const app = express();

app.use(cors());

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;



/* LOGIN */

app.get("/auth/discord", (req,res)=>{

    const url =
    `https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=identify`;

    res.redirect(url);

});

/* CALLBACK */

app.get("/auth/discord/callback", async(req,res)=>{

    const code = req.query.code;

    try{

        const tokenRes = await axios.post(
            "https://discord.com/api/oauth2/token",
            new URLSearchParams({
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
                grant_type: "authorization_code",
                code,
                redirect_uri: REDIRECT_URI
            }),
            {
                headers:{
                    "Content-Type":"application/x-www-form-urlencoded"
                }
            }
        );

        const accessToken = tokenRes.data.access_token;

        const userRes = await axios.get(
    "https://discord.com/api/users/@me",
    {
        headers:{
            Authorization:`Bearer ${accessToken}`
        }
    }
);

        const user = userRes.data;

        res.redirect(
            `https://riglify.github.io/?username=${encodeURIComponent(user.username)}&avatar=${user.avatar}&id=${user.id}`
        );

    }catch(err){

        console.log(err.response?.data || err.message);

        res.send("OAuth failed.");

    }

});

/* AVATAR FETCHER */

app.get("/avatar/:username", async(req,res)=>{

try {

    // Fetch avatar data
    const exportResponse = await axios.get(
        `https://riglify.onrender.com/avatar/${targetUserId}`
    );

    const avatarData = exportResponse.data;

    if (!avatarData || !avatarData.success) {
        throw new Error("Could not retrieve avatar data.");
    }

    const archive = archiver("zip", {
        zlib: { level: 9 }
    });

    // ZIP filename:
    // Riglify_Tylernipad123_obj.zip
    res.attachment(
        `Riglify_${avatarData.username}_${format}.zip`
    );

    archive.on("error", (err) => {
        throw err;
    });

    archive.pipe(res);

    /*
    ============================================================
    TEMPORARY OBJ FILE
    ============================================================
    */

    const objContent = `
# Riglify Roblox Avatar Export
# Username: ${avatarData.username}
# User ID: ${avatarData.userId}

# OBJ conversion will be added here.

`;

    archive.append(
        objContent,
        {
            name: `${avatarData.username}.obj`
        }
    );

    /*
    ============================================================
    TEMPORARY MLB FILE
    ============================================================
    */

    const mlbContent = `
Riglify Avatar
Username: ${avatarData.username}
UserID: ${avatarData.userId}

`;

    archive.append(
        mlbContent,
        {
            name: `${avatarData.username}.mlb`
        }
    );

    await archive.finalize();

    console.log(
        `ZIP successfully created for ${avatarData.username}`
    );

    return;

} catch (err) {

    console.error(
        "ZIP EXPORT ERROR:",
        err.message
    );

    if (!res.headersSent) {

        return res.status(500).json({
            success: false,
            error: err.message
        });

    }

}

    // INDIVIDUAL ASSET DOWNLOAD

    const assetUrl =
        `https://assetdelivery.roproxy.com/v1/asset/?id=${assetId}`;

    console.log("Downloading asset:", assetId);
    console.log("Download URL:", assetUrl);

    const assetRes = await axios.get(
        assetUrl,
        {
            responseType: 'stream',
            headers: {
                "User-Agent": "Mozilla/5.0"
            }
        }
    );

    res.setHeader(
        'Content-Type',
        'application/octet-stream'
    );

    res.setHeader(
        'Content-Disposition',
        `attachment; filename="asset_${assetId}.rbxm"`
    );

    return assetRes.data.pipe(res);

} catch (err) {

    console.error(
        "========== DOWNLOAD FAILURE =========="
    );

    console.error("Message:", err.message);
    console.error("Status:", err.response?.status);
    console.error("URL:", err.config?.url);

    if (!res.headersSent) {
        return res.status(500).json({
            success: false,
            error: err.message
        });
    }

}

});


/* ==========================================================================
   RIGLIFY DOWNLOAD SYSTEM
   ========================================================================== */

app.get('/download/:id', async (req, res) => {

    const assetId = req.params.id;
    const targetUserId = req.query.userId;

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');

    try {

        /*
        ============================================================
        OBJ ZIP EXPORT
        ============================================================
        */

        if (assetId === "all_obj") {

            if (!targetUserId) {
                return res.status(400).json({
                    success: false,
                    error: "Missing userId."
                });
            }

            console.log(
                `Starting OBJ export for user ${targetUserId}`
            );

            // Fetch avatar data
            const exportResponse = await axios.get(
                `https://riglify.onrender.com/avatar/${targetUserId}`
            );

            const avatarData = exportResponse.data;

            if (!avatarData || !avatarData.success) {
                throw new Error(
                    "Could not retrieve avatar data."
                );
            }

            const archive = archiver("zip", {
                zlib: { level: 9 }
            });

            // Example:
            // Riglify_Tylernipad123_obj.zip
            res.attachment(
                `Riglify_${avatarData.username}_obj.zip`
            );

            archive.on("error", (err) => {
                throw err;
            });

            archive.pipe(res);

            /*
            ========================================================
            TEMPORARY OBJ FILE
            ========================================================
            */

            const objContent = `
# Riglify Roblox Avatar Export
# Username: ${avatarData.username}
# User ID: ${avatarData.userId}

# OBJ conversion will be added here.
`;

            archive.append(
                objContent,
                {
                    name: `${avatarData.username}.obj`
                }
            );

            /*
            ========================================================
            TEMPORARY MLB FILE
            ========================================================
            */

            const mlbContent = `
Riglify Avatar
Username: ${avatarData.username}
UserID: ${avatarData.userId}
`;

            archive.append(
                mlbContent,
                {
                    name: `${avatarData.username}.mlb`
                }
            );

            await archive.finalize();

            console.log(
                `ZIP successfully created for ${avatarData.username}`
            );

            return;
        }


        /*
        ============================================================
        INDIVIDUAL ASSET DOWNLOAD
        ============================================================
        */

        const assetUrl =
            `https://assetdelivery.roproxy.com/v1/asset/?id=${assetId}`;

        console.log(
            "Downloading asset:",
            assetId
        );

        console.log(
            "Download URL:",
            assetUrl
        );

        const assetRes = await axios.get(
            assetUrl,
            {
                responseType: 'stream',
                headers: {
                    "User-Agent": "Mozilla/5.0"
                }
            }
        );

        res.setHeader(
            'Content-Type',
            'application/octet-stream'
        );

        res.setHeader(
            'Content-Disposition',
            `attachment; filename="asset_${assetId}.rbxm"`
        );

        return assetRes.data.pipe(res);


    } catch (err) {

        console.error(
            "========== DOWNLOAD FAILURE =========="
        );

        console.error(
            "Message:",
            err.message
        );

        console.error(
            "Status:",
            err.response?.status
        );

        console.error(
            "URL:",
            err.config?.url
        );

        if (!res.headersSent) {

            return res.status(500).json({
                success: false,
                error: err.message
            });

        }

    }

});



/* GITHUB LOGIN */

app.get("/auth/github", (req,res)=>{

    const url =
`https://github.com/login/oauth/authorize?client_id=${process.env.GITHUB_CLIENT_ID}&scope=read:user user:email`;

    res.redirect(url);

});

/* GITHUB CALLBACK */

app.get("/auth/github/callback", async(req,res)=>{

    const code = req.query.code;

    try{

        const tokenRes = await axios.post(
            "https://github.com/login/oauth/access_token",
            {
                client_id:
                process.env.GITHUB_CLIENT_ID,

                client_secret:
                process.env.GITHUB_CLIENT_SECRET,

                code:code
            },
            {
                headers:{
                    Accept:"application/json"
                }
            }
        );

        const accessToken =
        tokenRes.data.access_token;

        const userRes = await axios.get(
            "https://api.github.com/user",
            {
                headers:{
                    Authorization:
                    `Bearer ${accessToken}`
                }
            }
        );

        const user = userRes.data;

        res.redirect(
`https://riglify.github.io/?github=${encodeURIComponent(user.login)}&avatar=${encodeURIComponent(user.avatar_url)}`
        );

    }catch(err){

        console.log(
            err.response?.data || err.message
        );

        res.send("GitHub OAuth failed.");

    }

});



/* START SERVER */

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
    console.log("Server running");
});

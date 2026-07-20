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

/* ROBLOX USER JSON */

/* AVATAR FETCHER */

app.get("/avatar/:username", async(req,res)=>{

    try{

        const input = req.params.username;

        console.log("Looking up:", input);

        let userId;
        let user;

        /* IF INPUT IS USER ID */
        if(/^\d+$/.test(input)){

            userId = input;

            const userInfo = await axios.get(
                `https://users.roblox.com/v1/users/${userId}`
            );

            user = userInfo.data;

        }else{

            /* Username lookup */
            const userRes = await axios.post(
              "https://users.roblox.com/v1/usernames/users",
              {
                usernames: [input],
                excludeBannedUsers: false
              }
            );

            if(!userRes.data.data.length){

                return res.status(404).json({
                    error:"User not found"
                });

            }

            user = userRes.data.data[0];
            userId = user.id;

            console.log("Found user:", user);
            console.log("User ID:", userId);

        }

        /* AVATAR THUMBNAIL */
        console.log("Fetching thumbnail...");
        
        const thumbRes = await axios.get(
          `https://thumbnails.roblox.com/v1/users/avatar?userIds=${userId}&size=720x720&format=Png&isCircular=false`,
          {
            headers: { "User-Agent": "Mozilla/5.0" }
          }
        );
        const thumbUrl = thumbRes.data?.data?.[0]?.imageUrl || null;

        /* 3D THUMBNAIL */
let thumb3dUrl = null;

        /* AVATAR DETAILS */
        console.log("Fetching avatar details...");
        
        const outfitRes = await axios.get(
          `https://avatar.roblox.com/v1/users/${userId}/avatar`
        );

        const assets = outfitRes.data?.assets?.map(asset => asset.id) || [];
        console.log("OUTFIT RESPONSE ASSETS:", assets);

        /* ASSET DETAILS MAPPER (The Ultimate Triple-Fallback Engine) */
        const assetDetails = await Promise.all(
          assets.map(async (assetId) => {
            let realName = `Asset ${assetId}`;
            let realType = null;
            let imageUrl = null;

            // 1. FETCH THUMBNAIL IMAGE
            try {
              const thumbRes = await axios.get(
                `https://thumbnails.roblox.com/v1/assets?assetIds=${assetId}&size=420x420&format=Png`,
                { headers: { "User-Agent": "Mozilla/5.0" } }
              );
              imageUrl = thumbRes.data?.data?.[0]?.imageUrl || null;
            } catch (e) {
              console.log(`Thumbnail failed for ${assetId}`);
            }

            // 2. THE ULTIMATE TRIPLE NAME HUNT
            try {
              // --- ROUTE A: RoProxy Economy Details ---
              const resA = await axios.get(
                `https://economy.roproxy.com/v2/assets/${assetId}/details`,
                { headers: { "User-Agent": "Mozilla/5.0" } }
              );
              if (resA.data && (resA.data.Name || resA.data.name)) {
                realName = resA.data.Name || resA.data.name;
                realType = resA.data.AssetClassName || resA.data.AssetTypeId || null;
              }
            } catch (errA) {
              try {
                // --- ROUTE B: Direct Core Item API ---
                const resB = await axios.post(
                  `https://catalog.roproxy.com/v1/catalog/items/details`,
                  { items: [{ itemType: "Asset", id: parseInt(assetId) }] },
                  { headers: { "User-Agent": "Mozilla/5.0", "Content-Type": "application/json" } }
                );
                if (resB.data?.data?.[0]) {
                  realName = resB.data.data[0].name || realName;
                  realType = resB.data.data[0].assetType || realType;
                }
              } catch (errB) {
                try {
                  // --- ROUTE C: Hidden Api.Roblox Legacy Proxy Pass ---
                  const resC = await axios.get(
                    `https://api.roproxy.com/marketplace/productinfo?assetId=${assetId}`,
                    { headers: { "User-Agent": "Mozilla/5.0" } }
                  );
                  if (resC.data && resC.data.Name) {
                    realName = resC.data.Name;
                    realType = resC.data.AssetTypeCode || realType;
                  }
                } catch (errC) {
                  console.log(`All 3 Roblox name routes blocked for asset: ${assetId}`);
                }
              }
            }

            // Clean up asset numbers into readable words
            if (typeof realType === 'number') {
                const typeMap = { 8: "Hat", 41: "HairAccessory", 42: "FaceAccessory", 11: "Shirt", 12: "Pants", 2: "TShirt", 17: "Head" };
                realType = typeMap[realType] || "Accessory";
            }

            // --- BUNDLE LIMB AUTO-FIX ---
            if (realName.startsWith("Asset ") && imageUrl) {
                if (imageUrl.includes("LeftLeg")) { realName = "Left Leg"; realType = "BodyPart"; }
                else if (imageUrl.includes("RightLeg")) { realName = "Right Leg"; realType = "BodyPart"; }
                else if (imageUrl.includes("LeftArm")) { realName = "Left Arm"; realType = "BodyPart"; }
                else if (imageUrl.includes("RightArm")) { realName = "Right Arm"; realType = "BodyPart"; }
                else if (imageUrl.includes("Torso")) { realName = "Torso"; realType = "BodyPart"; }
                else if (imageUrl.includes("DynamicHead")) { realName = "Animated Head"; realType = "Head"; }
            }

            return {
              id: assetId,
              image: imageUrl,
              name: realName,
              assetType: realType
            };
          })
        );
        
        // Send successful JSON payload back
        res.json({
            success: true,
            username: user.name,
            displayName: user.displayName,
            userId: userId,
            thumbnail: thumbUrl,
            thumbnail3d: thumb3dUrl,
            assets: assetDetails
        });

    }catch(err){

        console.log("FULL ERROR:");
        console.log(err.response?.data);
        console.log(err.response?.status);
        console.log(err.message);

        res.status(500).json({
            error:"Failed to fetch avatar"
        });

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

if (assetId.startsWith('all_')) {

    if (!targetUserId) {
        return res.status(400).json({
            success: false,
            error: "Missing userId."
        });
    }

    const format = assetId.replace('all_', '');

    console.log(
        `Starting ${format.toUpperCase()} ZIP export for user ${targetUserId}`
    );

    try {

        // Fetch the avatar data from our own avatar endpoint
        const exportResponse = await axios.get(
            `https://riglify.onrender.com/avatar/${targetUserId}`
        );

        const avatarData = exportResponse.data;

        if (!avatarData || !avatarData.success) {
            throw new Error("Could not retrieve avatar data.");
        }
        
        const textures = [];

        const archive = archiver("zip", {
            zlib: { level: 9 }
        });

        res.attachment(
            `Riglify_${avatarData.username}_${format}.zip`
        );

        archive.on("error", (err) => {
            throw err;
        });

        archive.pipe(res);

        // Add the avatar data JSON into the ZIP
        archive.append(
            JSON.stringify(avatarData, null, 2),
            {
                name: `Riglify_${avatarData.username}_avatar.json`
            }
        );

        // Download each asset and put it in the ZIP
        for (const asset of avatarData.assets || []) {

            try {

                const assetResponse = await axios.get(
                    `https://assetdelivery.roproxy.com/v1/asset/?id=${asset.id}`,
                    {
                        responseType: "arraybuffer",
                        headers: {
                            "User-Agent": "Mozilla/5.0"
                        }
                    }
                );

                archive.append(
                    assetResponse.data,
                    {
                        name: `assets/asset_${asset.id}.rbxm`
                    }
                );

                console.log(
                    `Added asset ${asset.id} to ZIP`
                );

            } catch (assetError) {

                console.error(
                    `Failed to download asset ${asset.id}:`,
                    assetError.message
                );

            }

        }

        await archive.finalize();

        console.log(
            "ZIP successfully created."
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

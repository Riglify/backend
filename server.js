// server.js

const express = require("express");
const axios = require("axios");
const cors = require("cors");
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

        console.log("Fetching 3D thumbnail...");

        try {

            const thumb3dRes = await axios.get(
                `https://thumbnails.roblox.com/v1/users/avatar-3d?userIds=${userId}`,
                {
                    headers: { "User-Agent": "Mozilla/5.0" }
                }
            );

            thumb3dUrl = thumb3dRes.data?.data?.[0]?.imageUrl || null;
            console.log("3D thumbnail success");

        } catch(err) {
            console.log("3D THUMBNAIL FAILED");
        }

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
   RIGLIFY DOWNLOAD SYSTEM - REFACTORED CODE 
   ========================================================================== */

/* ==========================================================================
   RIGLIFY DOWNLOAD SYSTEM - FULLY PROXIED 3D MESH STREAM ROUTE
   ========================================================================== */

/* ==========================================================================
   RIGLIFY DOWNLOAD SYSTEM - COMPATIBLE BACKEND ROUTE
   ========================================================================== */

/* ==========================================================================
   RIGLIFY DOWNLOAD SYSTEM - FIREWALL BYPASS EXTENSION
   ========================================================================== */

app.get('/download/:id', async (req, res) => {
    const assetId = req.params.id;

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');

    try {
        // 1. CHROME 3D PREVIEW CHANNEL (AUTO-TEXTURE PACKER)
        if (assetId === 'all_glb') {
            res.setHeader('Content-Type', 'model/gltf-binary');
            res.setHeader('Content-Disposition', 'inline; filename="avatar.glb"');

            const targetUserId = req.query.userId || 2012; 

            const thumb3dRes = await axios.get(
                `https://thumbnails.roproxy.com/v1/users/avatar-3d?userIds=${targetUserId}`,
                { headers: { "User-Agent": "Mozilla/5.0" } }
            );

            const roblox3dUrl = thumb3dRes.data?.data?.[0]?.imageUrl;

            if (!roblox3dUrl) {
                res.setHeader('Content-Type', 'text/plain');
                return res.status(404).send("Roblox 3D preview asset generation profile not found.");
            }

            const modelDataRes = await axios.get(roblox3dUrl, { responseType: 'text' });
            let rawModelText = modelDataRes.data;

            const robloxImageRegex = /https:\/\/images\.roblox\.com\/asset\/\?id=(\d+)/g;
            
            let fixedModelText = rawModelText.replace(robloxImageRegex, (match, imageAssetId) => {
                return `https://riglify.onrender.com/download/${imageAssetId}?isTexture=true`;
            });

            return res.send(fixedModelText);
        }

        // 2. CHECK IF THIS REQUEST IS A IMAGE TEXTURE OR A MODEL ELEMENT (.RBXM)
        const isTextureRequest = req.query.isTexture === 'true';

        if (isTextureRequest) {
            // Force browser to handle this as a clean PNG data stream
            res.setHeader('Content-Type', 'image/png');
            res.setHeader('Content-Disposition', `inline; filename="texture_${assetId}.png"`);

            // Use the wide open public asset endpoint that never throws 403s for textures!
            const textureUrl = `https://assetdelivery.roproxy.com/v1/asset/?id=${assetId}`;
            
            const assetRes = await axios.get(textureUrl, { 
                responseType: 'stream',
                headers: { "User-Agent": "Mozilla/5.0" }
            });
            return assetRes.data.pipe(res);

        } else {
            // Standard individual static asset download override (.RBXM)
            res.setHeader('Content-Type', 'application/octet-stream');
            if (assetId.includes('_')) {
                res.setHeader('Content-Disposition', `attachment; filename="${assetId}"`);
            } else {
                res.setHeader('Content-Disposition', `attachment; filename="asset_${assetId}.rbxm"`);
            }

            const catalogDownloadUrl = `https://assetdelivery.roproxy.com/v1/asset/?id=${assetId}`;
            
            const assetRes = await axios.get(catalogDownloadUrl, { 
                responseType: 'stream',
                headers: { 
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8"
                }
            });
            
            return assetRes.data.pipe(res);
        }

    } catch (err) {
        console.error("Backend Download Engine Error:", err.message);
        
        if (!res.headersSent) {
            res.setHeader('Content-Type', 'text/plain');
            return res.status(500).send(`Download channel offline for this item: ${err.message}`);
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

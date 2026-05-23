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

        const username = req.params.username;

        /* USER ID */

        const userRes = await axios.post(
            "https://users.roblox.com/v1/usernames/users",
            {
                usernames:[username],
                excludeBannedUsers:false
            }
        );

        if(!userRes.data.data.length){

            return res.status(404).json({
                error:"User not found"
            });

        }

        const user = userRes.data.data[0];

        const userId = user.id;

        /* AVATAR THUMBNAIL */

        const thumbRes = await axios.get(
            `https://thumbnails.roblox.com/v1/users/avatar?userIds=${userId}&size=720x720&format=Png&isCircular=false`
        );

            /* 3D THUMBNAIL */

const thumb3dRes = await axios.get(
    `https://thumbnails.roblox.com/v1/users/avatar-3d?userIds=${userId}`
);

        /* AVATAR DETAILS */

const avatarRes = await axios.get(
    `https://avatar.roblox.com/v1/users/${userId}/currently-wearing`
);

/* ASSET IDS */

const assets = avatarRes.data.assetIds || [];

/* ASSET DETAILS */

const assetDetails = await Promise.all(

    assets.map(async(assetId)=>{

        try{

            /* THUMBNAIL */

            const thumbRes = await axios.get(
                `https://thumbnails.roblox.com/v1/assets?assetIds=${assetId}&size=420x420&format=Png`
            );

            const thumb =
            thumbRes.data.data[0]?.imageUrl;

            /* ASSET DETAILS */

            const detailsRes = await axios.get(
                `https://economy.roblox.com/v2/assets/${assetId}/details`
            );

            const details = detailsRes.data;

            return{

                id:assetId,

                image:thumb,

                name:details.Name,

                assetType:details.AssetTypeId

            };

        }catch{

            return{

                id:assetId,

                image:null,

                name:`Asset ${assetId}`,

                assetType:null

            };

        }

    })

);
res.json({

    success:true,

    username:user.name,

    displayName:user.displayName,

    userId:userId,

    thumbnail:
    thumbRes.data.data[0]?.imageUrl,

    thumbnail3d:
    thumb3dRes.data.data[0]?.imageUrl,


    assets:assetDetails

    
});

}catch(err){

        console.log(err.response?.data || err.message);

        res.status(500).json({
            error:"Failed to fetch avatar"
        });

    }

});
    
/* DOWNLOAD ASSET */

app.get("/download/:id", async(req,res)=>{

    try{

        const assetId = req.params.id;

        /* ROBLOX ASSET DELIVERY */

        const assetRes = await axios.get(
            `https://assetdelivery.roblox.com/v1/asset/?id=${assetId}`,
            {
                responseType:"stream"
            }
        );

        /* FILE DOWNLOAD */

        res.setHeader(
            "Content-Disposition",
            `attachment; filename="asset_${assetId}"`
        );

        assetRes.data.pipe(res);

    }catch(err){

        console.log(err.response?.data || err.message);

        res.status(500).send(
            "Failed to download asset."
        );

    }

});



/* START SERVER */

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
    console.log("Server running");
});


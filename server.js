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
console.log("Fetching 3D thumbnail...");
        
const thumb3dRes = await axios.get(
  `https://thumbnails.roblox.com/v1/users/avatar-3d?userIds=${userId}`,
  {
    headers: { "User-Agent": "Mozilla/5.0" }
  }
);
        const thumb3dUrl =
  thumb3dRes.data?.data?.[0]?.imageUrl || null;

        /* AVATAR DETAILS */
console.log("Fetching avatar details...");
        
const outfitRes = await axios.get(
  `https://avatar.roblox.com/v1/users/${userId}/avatar`
);

const assets =
  outfitRes.data?.assets?.map(asset => asset.id) || [];

console.log("OUTFIT RESPONSE:", outfitRes.data);

/* ASSET DETAILS */

const assetDetails = await Promise.all(
  assets.map(async (assetId) => {
    try {
      const thumbRes = await axios.get(
  `https://thumbnails.roblox.com/v1/assets?assetIds=${assetId}&size=420x420&format=Png`,
  {
    headers: { "User-Agent": "Mozilla/5.0" }
  }
);

const details = {
  Name: `Asset ${assetId}`,
  AssetTypeId: null
};

      return {
        id: assetId,
        image: thumbRes.data?.data?.[0]?.imageUrl || null,
        name: details.Name,
assetType: details.AssetTypeId
      };

    } catch {
      return {
        id: assetId,
        image: null,
        name: `Asset ${assetId}`,
        assetType: null
      };
    }
  })
);
        
        
res.json({

    success:true,

    username:user.name,

    displayName:user.displayName,

    userId:userId,

thumbnail: thumbUrl,
thumbnail3d: thumb3dUrl,

    assets:assetDetails

    
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
    
/* DOWNLOAD ASSET */

app.get("/download/:id", async(req,res)=>{

    try{

        const assetId = req.params.id;

        /* ROBLOX ASSET DELIVERY */

const assetRes = await axios.get(
    `https://assetdelivery.roblox.com/v1/asset/?id=${assetId}`,
    {
        responseType:"stream",
        headers: {
            "User-Agent": "Mozilla/5.0"
        }
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


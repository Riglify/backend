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

app.get("/avatar/:username", async (req, res) => {

    const identifier =
        String(req.params.username || "").trim();

    if (!identifier) {

        return res.status(400).json({
            success: false,
            error: "Missing Roblox username."
        });

    }

    try {

        /*
        ============================================================
        FIND ROBLOX USER
        ============================================================
        */

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
            userLookup.data?.data?.[0];


        if (!foundUser) {

            return res.status(404).json({

                success: false,

                error:
                    "Roblox user not found."

            });

        }


        const userId =
            String(foundUser.id);


        const username =
            foundUser.name;


        /*
        ============================================================
        GET AVATAR THUMBNAIL
        ============================================================
        */

        let thumbnail = "";


        try {

            const thumbnailResponse =
                await axios.get(

                    "https://thumbnails.roblox.com/v1/users/avatar",

                    {
                        params: {

                            userIds:
                                userId,

                            size:
                                "720x720",

                            format:
                                "Png",

                            isCircular:
                                false

                        }

                    }

                );


            thumbnail =
                thumbnailResponse
                    .data
                    ?.data?.[0]
                    ?.imageUrl || "";

        } catch (thumbnailError) {

            console.warn(

                "Could not load avatar thumbnail:",

                thumbnailError.response?.data ||
                thumbnailError.message

            );

        }


/*
============================================================
GET WORN ASSETS + REAL ASSET NAMES
============================================================
*/

let assets = [];

try {

    /*
    --------------------------------------------------------
    GET THE ASSET IDS THE USER IS WEARING
    --------------------------------------------------------
    */

    const avatarResponse =
        await axios.get(
            `https://avatar.roblox.com/v1/users/${userId}/currently-wearing`
        );

    const wornAssets =
        avatarResponse.data?.assetIds || [];

    console.log(
        "Worn Roblox asset IDs:",
        wornAssets
    );


    /*
    --------------------------------------------------------
    GET DETAILS FOR EVERY ASSET
    --------------------------------------------------------
    */

    if (wornAssets.length > 0) {

        assets = await Promise.all(

            wornAssets.map(async (assetId) => {

                let realName =
                    `Roblox Asset ${assetId}`;

                let realType =
                    "Asset";

                let imageUrl =
                    "";


                /*
                ------------------------------------------------
                GET ASSET THUMBNAIL
                ------------------------------------------------
                */

                try {

                    const thumbnailResponse =
                        await axios.get(

                            "https://thumbnails.roblox.com/v1/assets",

                            {
                                params: {

                                    assetIds:
                                        String(assetId),

                                    size:
                                        "420x420",

                                    format:
                                        "Png",

                                    isCircular:
                                        false

                                },

                                headers: {
                                    "User-Agent":
                                        "Mozilla/5.0"
                                }

                            }

                        );


                    imageUrl =
                        thumbnailResponse
                            .data
                            ?.data?.[0]
                            ?.imageUrl || "";

                } catch (thumbnailError) {

                    console.warn(
                        `Thumbnail lookup failed for ${assetId}:`,
                        thumbnailError.response?.data ||
                        thumbnailError.message
                    );

                }


                /*
                ------------------------------------------------
                REAL ASSET NAME LOOKUP
                ------------------------------------------------
                */

                /*
                ROUTE A:
                Economy API
                */

                try {

                    const economyResponse =
                        await axios.get(

                            `https://economy.roproxy.com/v2/assets/${assetId}/details`,

                            {
                                headers: {
                                    "User-Agent":
                                        "Mozilla/5.0"
                                }
                            }

                        );


                    const economyData =
                        economyResponse.data;


                    if (
                        economyData &&
                        (
                            economyData.Name ||
                            economyData.name
                        )
                    ) {

                        realName =
                            economyData.Name ||
                            economyData.name;

                        realType =
                            economyData.AssetClassName ||
                            economyData.AssetTypeId ||
                            realType;

                    }

                } catch (economyError) {

                    console.log(
                        `Economy lookup failed for ${assetId}. Trying catalog API...`
                    );


                    /*
                    ROUTE B:
                    Catalog API
                    */

                    try {

                        const catalogResponse =
                            await axios.post(

                                "https://catalog.roproxy.com/v1/catalog/items/details",

                                {
                                    items: [
                                        {
                                            itemType:
                                                "Asset",

                                            id:
                                                Number(assetId)
                                        }
                                    ]
                                },

                                {
                                    headers: {

                                        "User-Agent":
                                            "Mozilla/5.0",

                                        "Content-Type":
                                            "application/json"

                                    }
                                }

                            );


                        const catalogItem =
                            catalogResponse
                                .data
                                ?.data?.[0];


                        if (catalogItem) {

                            realName =
                                catalogItem.name ||
                                realName;

                            realType =
                                catalogItem.assetType ||
                                realType;

                        }

                    } catch (catalogError) {

                        console.log(
                            `Catalog lookup failed for ${assetId}. Trying legacy API...`
                        );


                        /*
                        ROUTE C:
                        Legacy Product Info API
                        */

                        try {

                            const productResponse =
                                await axios.get(

                                    `https://api.roproxy.com/marketplace/productinfo?assetId=${assetId}`,

                                    {
                                        headers: {
                                            "User-Agent":
                                                "Mozilla/5.0"
                                        }
                                    }

                                );


                            const productData =
                                productResponse.data;


                            if (
                                productData &&
                                productData.Name
                            ) {

                                realName =
                                    productData.Name;

                                realType =
                                    productData.AssetTypeCode ||
                                    realType;

                            }

                        } catch (productError) {

                            console.log(
                                `All asset name lookup routes failed for ${assetId}.`
                            );

                        }

                    }

                }


                /*
                ------------------------------------------------
                CONVERT NUMERIC ASSET TYPES
                ------------------------------------------------
                */

                if (
                    typeof realType ===
                    "number"
                ) {

                    const typeMap = {

                        8:
                            "Hat",

                        41:
                            "HairAccessory",

                        42:
                            "FaceAccessory",

                        11:
                            "Shirt",

                        12:
                            "Pants",

                        2:
                            "TShirt",

                        17:
                            "Head"

                    };


                    realType =
                        typeMap[realType] ||
                        "Accessory";

                }


                /*
                ------------------------------------------------
                BODY PART FALLBACK
                ------------------------------------------------
                */

                if (
                    realName.startsWith(
                        "Roblox Asset "
                    ) &&
                    imageUrl
                ) {

                    if (
                        imageUrl.includes(
                            "LeftLeg"
                        )
                    ) {

                        realName =
                            "Left Leg";

                        realType =
                            "BodyPart";

                    } else if (
                        imageUrl.includes(
                            "RightLeg"
                        )
                    ) {

                        realName =
                            "Right Leg";

                        realType =
                            "BodyPart";

                    } else if (
                        imageUrl.includes(
                            "LeftArm"
                        )
                    ) {

                        realName =
                            "Left Arm";

                        realType =
                            "BodyPart";

                    } else if (
                        imageUrl.includes(
                            "RightArm"
                        )
                    ) {

                        realName =
                            "Right Arm";

                        realType =
                            "BodyPart";

                    } else if (
                        imageUrl.includes(
                            "Torso"
                        )
                    ) {

                        realName =
                            "Torso";

                        realType =
                            "BodyPart";

                    } else if (
                        imageUrl.includes(
                            "DynamicHead"
                        )
                    ) {

                        realName =
                            "Animated Head";

                        realType =
                            "Head";

                    }

                }


                /*
                ------------------------------------------------
                RETURN FINAL ASSET DATA
                ------------------------------------------------
                */

                return {

                    id:
                        String(assetId),

                    name:
                        realName,

                    image:
                        imageUrl,

                    thumbnailState:
                        "Ready",

                    assetType:
                        realType

                };

            })

        );

    }


    console.log(
        "Final assets sent to Riglify:",
        JSON.stringify(
            assets,
            null,
            2
        )
    );


} catch (assetError) {

    console.error(
        "ROBLOX WORN ASSET ERROR:",
        assetError.response?.data ||
        assetError.message
    );

}

        /*
        ============================================================
        SEND AVATAR DATA
        ============================================================
        */

        return res.json({

            success:
                true,

            userId:
                userId,

            username:
                username,

            thumbnail:
                thumbnail,

            assets:
                assets

        });


    } catch (err) {

        console.error(

            "AVATAR FETCH ERROR:",

            err.response?.data ||
            err.message

        );


        return res.status(500).json({

            success:
                false,

            error:
                "Failed to retrieve Roblox avatar."

        });

    }

});

/* ==========================================================================
   RIGLIFY DOWNLOAD SYSTEM
   ========================================================================== */

app.get('/download/:id', async (req, res) => {

    const assetId = String(req.params.id || "").trim();
    const targetUserId = String(req.query.userId || "").trim();

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');

    try {

        /*
        ============================================================
        BASIC VALIDATION
        ============================================================
        */

        if (!assetId) {
            return res.status(400).json({
                success: false,
                error: "Missing asset ID."
            });
        }


        /*
        ============================================================
        FULL AVATAR EXPORTS
        ============================================================
        */

        const fullAvatarFormats = [
            "all_obj",
            "all_glb",
            "all_rbxm",
            "unity_fbx",
            "unreal_fbx",
            "blender_glb",
            "maya_obj",
            "c4d_dae",
            "all_ply",
            "all_stl"
        ];


        if (fullAvatarFormats.includes(assetId)) {

            if (!targetUserId) {
                return res.status(400).json({
                    success: false,
                    error: "Missing userId."
                });
            }


            console.log(
                `Starting ${assetId} export for Roblox user ${targetUserId}`
            );


            /*
            ========================================================
            GET ROBLOX USER INFORMATION DIRECTLY FROM USER ID
            ========================================================
            */

            const userResponse = await axios.get(
                `https://users.roblox.com/v1/users/${encodeURIComponent(targetUserId)}`
            );


            const userData = userResponse.data;


            if (!userData || !userData.id) {
                throw new Error(
                    "Could not retrieve Roblox user information."
                );
            }


            const username =
                userData.name || `User_${targetUserId}`;


            /*
            ========================================================
            GET CURRENTLY WORN ASSETS
            ========================================================
            */

            let wornAssets = [];


            try {

                const avatarResponse = await axios.get(
                    `https://avatar.roblox.com/v1/users/${encodeURIComponent(targetUserId)}/currently-wearing`
                );


                wornAssets =
                    avatarResponse.data?.assetIds || [];


            } catch (avatarError) {

                console.error(
                    "Could not retrieve worn assets:",
                    avatarError.response?.data ||
                    avatarError.message
                );

            }


            console.log(
                `Found ${wornAssets.length} worn assets for ${username}`
            );


            /*
            ========================================================
            CREATE ZIP
            ========================================================
            */

            const archive = archiver("zip", {
                zlib: {
                    level: 9
                }
            });


            archive.on("error", (archiveError) => {

                console.error(
                    "Archive error:",
                    archiveError
                );

                if (!res.headersSent) {

                    res.status(500).json({
                        success: false,
                        error: archiveError.message
                    });

                } else {

                    res.destroy(archiveError);

                }

            });


            /*
            ========================================================
            DETERMINE REQUESTED FORMAT
            ========================================================
            */

            let formatName = "Unknown";
            let extension = "txt";


            switch (assetId) {

                case "all_obj":
                    formatName = "OBJ";
                    extension = "obj";
                    break;

                case "all_glb":
                    formatName = "GLB";
                    extension = "glb";
                    break;

                case "all_rbxm":
                    formatName = "RBXM";
                    extension = "rbxm";
                    break;

                case "unity_fbx":
                    formatName = "Unity FBX";
                    extension = "fbx";
                    break;

                case "unreal_fbx":
                    formatName = "Unreal Engine FBX";
                    extension = "fbx";
                    break;

                case "blender_glb":
                    formatName = "Blender GLB";
                    extension = "glb";
                    break;

                case "maya_obj":
                    formatName = "Maya OBJ";
                    extension = "obj";
                    break;

                case "c4d_dae":
                    formatName = "Cinema4D DAE";
                    extension = "dae";
                    break;

                case "all_ply":
                    formatName = "PLY";
                    extension = "ply";
                    break;

                case "all_stl":
                    formatName = "STL";
                    extension = "stl";
                    break;

            }


            /*
            ========================================================
            RESPONSE HEADERS
            ========================================================
            */

            res.setHeader(
                "Content-Type",
                "application/zip"
            );

            res.setHeader(
                "Content-Disposition",
                `attachment; filename="Riglify_${username}_${assetId}.zip"`
            );


            archive.pipe(res);


            /*
            ========================================================
            EXPORT INFORMATION
            ========================================================
            */

            const exportInfo = `
RIGLIFY AVATAR EXPORT
=====================

Username: ${username}
User ID: ${targetUserId}

Requested Format: ${formatName}
File Extension: .${extension}

Worn Assets: ${wornAssets.length}

Generated by Riglify
https://riglify.github.io

NOTE:
This export format is currently under development.
The actual Roblox-to-${formatName} conversion system
will be added in a future Riglify update.
`;


            archive.append(
                exportInfo,
                {
                    name: "Riglify_Export_Info.txt"
                }
            );


            /*
            ========================================================
            ASSET LIST
            ========================================================
            */

            if (wornAssets.length > 0) {

                const assetList =
                    wornAssets
                        .map(
                            id => String(id)
                        )
                        .join("\n");


                archive.append(
                    assetList,
                    {
                        name: "Riglify_Asset_IDs.txt"
                    }
                );

            } else {

                archive.append(
                    "No worn assets were found.",
                    {
                        name: "Riglify_Asset_IDs.txt"
                    }
                );

            }


            /*
            ========================================================
            FINALIZE EXPORT
            ========================================================
            */

            await archive.finalize();


            console.log(
                `Export completed for ${username} (${formatName})`
            );

            return;
        }


        /*
        ============================================================
        INDIVIDUAL ROBLOX ASSET DOWNLOAD
        ============================================================
        */

        console.log(
            "Downloading individual Roblox asset:",
            assetId
        );


        /*
        ========================================================
        VALIDATE ASSET ID
        ========================================================
        */

        if (!/^\d+$/.test(assetId)) {

            return res.status(400).json({
                success: false,
                error: "Invalid Roblox asset ID."
            });

        }


        /*
        ========================================================
        ROBLOX ASSET DELIVERY
        ========================================================
        */

        const assetUrl =
            `https://assetdelivery.roproxy.com/v1/asset/?id=${encodeURIComponent(assetId)}`;


        console.log(
            "Download URL:",
            assetUrl
        );


        const assetRes = await axios.get(
            assetUrl,
            {
                responseType: "arraybuffer",

                timeout: 30000,

                headers: {
                    "User-Agent":
                        "Mozilla/5.0"
                },

                validateStatus: () => true
            }
        );


        /*
        ========================================================
        CHECK ROBLOX RESPONSE
        ========================================================
        */

        if (
            assetRes.status < 200 ||
            assetRes.status >= 300
        ) {

            console.error(
                "Roblox asset delivery failed:",
                assetRes.status
            );


            return res.status(502).json({
                success: false,
                error:
                    `Roblox asset service returned status ${assetRes.status}.`
            });

        }


        /*
        ========================================================
        CHECK EMPTY RESPONSE
        ========================================================
        */

        if (
            !assetRes.data ||
            assetRes.data.length === 0
        ) {

            return res.status(502).json({
                success: false,
                error:
                    "Roblox returned an empty asset."
            });

        }


        /*
        ========================================================
        SEND ASSET
        ========================================================
        */

        res.setHeader(
            "Content-Type",
            "application/octet-stream"
        );

        res.setHeader(
            "Content-Disposition",
            `attachment; filename="Riglify_${assetId}.rbxm"`
        );

        res.setHeader(
            "Content-Length",
            assetRes.data.length
        );


        return res.send(assetRes.data);


    } catch (err) {

        /*
        ============================================================
        ERROR HANDLING
        ============================================================
        */

        console.error(
            "========== RIGLIFY DOWNLOAD FAILURE =========="
        );

        console.error(
            "Asset ID:",
            assetId
        );

        console.error(
            "User ID:",
            targetUserId
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


        /*
        ========================================================
        TIMEOUT
        ========================================================
        */

        if (err.code === "ECONNABORTED") {

            return res.status(504).json({
                success: false,
                error:
                    "The Roblox service took too long to respond."
            });

        }


        /*
        ========================================================
        NORMAL ERROR
        ========================================================
        */

        if (!res.headersSent) {

            return res.status(500).json({
                success: false,
                error:
                    err.message ||
                    "Download failed."
            });

        }


        /*
        ========================================================
        RESPONSE ALREADY STARTED
        ========================================================
        */

        res.destroy(err);

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

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
const ROBLOX_API_KEY = process.env.ROBLOX_API_KEY;
console.log(
    "Roblox API key loaded:",
    Boolean(ROBLOX_API_KEY),
    "Length:",
    ROBLOX_API_KEY?.length
);

const RIGLIFY_UNIVERSE_ID = "10765943302";
const RIGLIFY_PLACE_ID = "114465018225131";

async function runRbxmTest() {
    const script = `
local SerializationService = game:GetService("SerializationService")

local model = Instance.new("Model")
model.Name = "RiglifyRBXMTest"

local part = Instance.new("Part")
part.Name = "TestPart"
part.Size = Vector3.new(4, 4, 4)
part.Anchored = true
part.Parent = model

local serialized = SerializationService:SerializeInstancesAsync({ model })

return serialized
`;

    const createResponse = await axios.post(
        `https://apis.roblox.com/cloud/v2/universes/${RIGLIFY_UNIVERSE_ID}/places/${RIGLIFY_PLACE_ID}/luau-execution-session-tasks`,
        {
            script,
            enableBinaryOutput: true,
            timeout: "30s"
        },
        {
            headers: {
                "x-api-key": ROBLOX_API_KEY,
                "Content-Type": "application/json"
            },
            timeout: 30000
        }
    );

    let task = createResponse.data;

    console.log("RBXM task created:", task.path);

    while (
        task.state === "QUEUED" ||
        task.state === "PROCESSING"
    ) {
        await new Promise(resolve =>
            setTimeout(resolve, 1500)
        );

        const taskResponse = await axios.get(
            `https://apis.roblox.com/cloud/v2/${task.path}`,
            {
                headers: {
                    "x-api-key": ROBLOX_API_KEY
                },
                timeout: 30000
            }
        );

        task = taskResponse.data;
    }

    if (task.state !== "COMPLETE") {
        throw new Error(
            task.error?.message ||
            `RBXM task failed with state ${task.state}`
        );
    }

    if (!task.binaryOutputUri) {
        throw new Error(
            "Roblox completed the RBXM task but returned no binary output URI."
        );
    }

    const binaryResponse = await axios.get(
        task.binaryOutputUri,
        {
            responseType: "arraybuffer",
            timeout: 30000
        }
    );

    if (
        !binaryResponse.data ||
        binaryResponse.data.length === 0
    ) {
        throw new Error(
            "Roblox returned an empty RBXM file."
        );
    }

    return Buffer.from(binaryResponse.data);
}




app.get("/test-rbxm", async (req, res) => {
    try {
        const rbxm = await runRbxmTest();

        res.setHeader("Content-Type", "model/x-rbxm");
        res.setHeader(
            "Content-Disposition",
            'attachment; filename="Riglify_RBXM_Test.rbxm"'
        );
        res.setHeader("Content-Length", rbxm.length);

        return res.send(rbxm);
    } catch (err) {
        console.error(
            "RBXM TEST ERROR:",
            err.response?.data || err.message
        );

        return res.status(500).json({
            success: false,
            error:
                err.response?.data ||
                err.message ||
                "Unknown RBXM error"
        });
    }
});





const DOWNLOADABLE_AVATAR_ASSET_TYPES = new Set([
    // Classic body
    17, // Head
    27, // Torso
    28, // RightArm
    29, // LeftArm
    30, // LeftLeg
    31, // RightLeg

    // Rigid accessories
    8,  // Hat
    41, // HairAccessory
    42, // FaceAccessory
    43, // NeckAccessory
    44, // ShoulderAccessory
    45, // FrontAccessory
    46, // BackAccessory
    47, // WaistAccessory

    // Layered/accessory types
    64, // TShirtAccessory
    65, // ShirtAccessory
    66, // PantsAccessory
    67, // JacketAccessory
    68, // SweaterAccessory
    69, // ShortsAccessory
    70, // LeftShoeAccessory
    71, // RightShoeAccessory
    72, // DressSkirtAccessory
    76, // EyebrowAccessory
    77  // EyelashAccessory
]);

const BLOCKED_AVATAR_ASSET_TYPES = new Set([
    2,  // TShirt
    11, // Shirt
    12, // Pants

    // Animations
    48, // Climb
    50, // Fall
    51, // Idle
    52, // Jump
    53, // Run
    54, // Swim
    55, // Walk
    61, // Emote
    78  // Mood
]);

const BLOCKED_AVATAR_ITEM_NAMES = new Set([
    "DefaultFallBackMood"
]);


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
============================================================
FILTER NON-DOWNLOADABLE AVATAR ITEMS
============================================================
*/

const normalizedType =
    String(realType || "")
        .toLowerCase()
        .replace(/[\s_-]/g, "");

const normalizedName =
    String(realName || "")
        .toLowerCase()
        .replace(/[\s_-]/g, "");

const blockedByName =
    normalizedName === "defaultfallbackmood";

const blockedByType =
    BLOCKED_AVATAR_ASSET_TYPES.has(
        Number(realType)
    ) ||
    normalizedType.includes("animation") ||
    normalizedType.includes("shirt") ||
    normalizedType.includes("pants") ||
    normalizedType.includes("tshirt") ||
    normalizedType.includes("mood");

if (blockedByName || blockedByType) {
    console.log(
        `Skipping non-downloadable avatar item ${assetId}:`,
        realName,
        realType
    );

    return null;
}

const numericType = Number(realType);

if (
    !DOWNLOADABLE_AVATAR_ASSET_TYPES.has(
        numericType
    )
) {
    console.log(
        `Skipping unknown avatar item ${assetId}:`,
        realName,
        realType
    );

    return null;
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

    res.setHeader("Access-Control-Allow-Origin", "*");

    try {

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
            GET ROBLOX USER
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
                userData.name ||
                `User_${targetUserId}`;


            /*
            ========================================================
            REAL GLB EXPORT
            ========================================================
            */

            if (
                assetId === "all_glb" ||
                assetId === "blender_glb"
            ) {

                console.log(
                    `Requesting Roblox 3D avatar for ${username}`
                );


                /*
                Roblox's Avatar 3D endpoint returns an object
                containing an imageUrl pointing to Roblox's
                generated 3D avatar data.
                */

                const avatar3DResponse =
                    await axios.get(
                        "https://thumbnails.roblox.com/v1/users/avatar-3d",
                        {
                            params: {
                                userId:
                                    targetUserId
                            },

                            headers: {
    "User-Agent":
        "Riglify/1.0",
    "x-api-key":
        ROBLOX_API_KEY
},

                            timeout:
                                30000
                        }
                    );


                const avatar3D =
                    avatar3DResponse.data;


                console.log(
                    "Roblox Avatar 3D response:",
                    JSON.stringify(
                        avatar3D,
                        null,
                        2
                    )
                );


                const imageUrl =
                    avatar3D?.imageUrl;


                if (!imageUrl) {

                    throw new Error(
                        "Roblox did not return a 3D avatar URL."
                    );

                }


                /*
                ----------------------------------------------------
                DOWNLOAD ROBLOX'S GENERATED 3D AVATAR DATA
                ----------------------------------------------------
                */

                const modelResponse =
                    await axios.get(
                        imageUrl,
                        {
                            responseType:
                                "arraybuffer",

                            timeout:
                                30000,

                            headers: {
                                "User-Agent":
                                    "Riglify/1.0"
                            }
                        }
                    );


                if (
                    !modelResponse.data ||
                    modelResponse.data.length === 0
                ) {

                    throw new Error(
                        "Roblox returned an empty 3D avatar."
                    );

                }


                /*
                ----------------------------------------------------
                SEND THE GENERATED MODEL
                ----------------------------------------------------
                */

                res.setHeader(
                    "Content-Type",
                    "model/gltf-binary"
                );

                res.setHeader(
                    "Content-Disposition",
                    `attachment; filename="Riglify_${username}.glb"`
                );

                res.setHeader(
                    "Content-Length",
                    modelResponse.data.length
                );


                return res.send(
                    modelResponse.data
                );

            }


            /*
            ========================================================
            REAL OBJ EXPORT
            ========================================================
            */

            if (assetId === "all_obj") {

                const avatar3DResponse =
                    await axios.get(
                        "https://thumbnails.roblox.com/v1/users/avatar-3d",
                        {
                            params: {
                                userId:
                                    targetUserId
                            },

                            headers: {
    "User-Agent":
        "Riglify/1.0",
    "x-api-key":
        ROBLOX_API_KEY
},

                            timeout:
                                30000
                        }
                    );


                const avatar3D =
                    avatar3DResponse.data;


                const imageUrl =
                    avatar3D?.imageUrl;


                if (!imageUrl) {
                    throw new Error(
                        "Roblox did not return the avatar 3D data URL."
                    );
                }


                /*
                ----------------------------------------------------
                DOWNLOAD AVATAR 3D DATA
                ----------------------------------------------------
                */

                const modelResponse =
                    await axios.get(
                        imageUrl,
                        {
                            responseType:
                                "json",

                            timeout:
                                30000,

                            headers: {
                                "User-Agent":
                                    "Riglify/1.0"
                            }
                        }
                    );


                const modelData =
                    modelResponse.data;


                /*
                ----------------------------------------------------
                GET OBJ / MTL HASHES
                ----------------------------------------------------
                */

                if (
                    !modelData ||
                    !modelData.obj
                ) {

                    throw new Error(
                        "Roblox did not return OBJ avatar data."
                    );

                }


                function robloxCdnUrl(hash) {

                    let value =
                        31;

                    for (
                        let i = 0;
                        i < Math.min(
                            38,
                            hash.length
                        );
                        i++
                    ) {

                        value ^=
                            hash
                                .charCodeAt(i);

                    }


                    const server =
                        ((value % 8) + 8) % 8;


                    return `https://t${server}.rbxcdn.com/${hash}`;

                }


                const objUrl =
                    robloxCdnUrl(
                        modelData.obj
                    );


                const objResponse =
                    await axios.get(
                        objUrl,
                        {
                            responseType:
                                "text",

                            timeout:
                                30000,

                            headers: {
                                "User-Agent":
                                    "Riglify/1.0"
                            }
                        }
                    );


                let mtlText =
                    "";


                if (modelData.mtl) {

                    const mtlUrl =
                        robloxCdnUrl(
                            modelData.mtl
                        );


                    const mtlResponse =
                        await axios.get(
                            mtlUrl,
                            {
                                responseType:
                                    "text",

                                timeout:
                                    30000,

                                headers: {
                                    "User-Agent":
                                        "Riglify/1.0"
                                }
                            }
                        );


                    mtlText =
                        mtlResponse.data || "";

                }


                /*
                ----------------------------------------------------
                CREATE OBJ ZIP
                ----------------------------------------------------
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


                archive.on(
                    "error",
                    (archiveError) => {

                        console.error(
                            "OBJ archive error:",
                            archiveError
                        );

                        if (
                            !res.headersSent
                        ) {

                            res.status(500).json({
                                success: false,
                                error:
                                    archiveError.message
                            });

                        } else {

                            res.destroy(
                                archiveError
                            );

                        }

                    }
                );


                res.setHeader(
                    "Content-Type",
                    "application/zip"
                );

                res.setHeader(
                    "Content-Disposition",
                    `attachment; filename="Riglify_${username}_obj.zip"`
                );


                archive.pipe(res);


                archive.append(
                    objResponse.data,
                    {
                        name:
                            `${username}.obj`
                    }
                );


                if (mtlText) {

                    archive.append(
                        mtlText,
                        {
                            name:
                                `${username}.mtl`
                        }
                    );

                }


                archive.append(
                    `
RIGLIFY OBJ EXPORT

Username: ${username}
User ID: ${targetUserId}

Generated by Riglify.
`,
                    {
                        name:
                            "Riglify_Export_Info.txt"
                    }
                );


                await archive.finalize();


                console.log(
                    `OBJ export completed for ${username}`
                );


                return;

            }


// ==============================
// OTHER FORMATS
// ==============================

const unsupportedFormats = [
  "unity_fbx",
  "unreal_fbx",
  "blender_glb",
  "maya_obj",
  "c4d_dae",
  "all_ply",
  "all_stl"
];

if (unsupportedFormats.includes(assetId)) {
  console.log(`Unsupported export format requested: ${assetId}`);

  return res.status(501).json({
    success: false,
    error: "This export format is not currently supported by Riglify.",
    format: assetId
  });
}


        /*
        ============================================================
        INDIVIDUAL ROBLOX ASSET DOWNLOAD
        ============================================================
        */

        if (!/^\d+$/.test(assetId)) {

            return res.status(400).json({
                success: false,
                error:
                    "Invalid Roblox asset ID."
            });

        }


        console.log(
            "Downloading individual Roblox asset:",
            assetId
        );


        const assetUrl =
            `https://assetdelivery.roproxy.com/v1/asset/?id=${encodeURIComponent(assetId)}`;


        const assetRes =
            await axios.get(
                assetUrl,
                {
                    responseType:
                        "arraybuffer",

                    timeout:
                        30000,

                    headers: {
                        "User-Agent":
                            "Mozilla/5.0"
                    },

                    validateStatus:
                        () => true
                }
            );


        if (
            assetRes.status < 200 ||
            assetRes.status >= 300
        ) {

            return res.status(502).json({
                success: false,
                error:
                    `Roblox asset service returned status ${assetRes.status}.`
            });

        }


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


        return res.send(
    assetRes.data
);

}

} catch (err) {

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
    
    console.log(
    "Roblox API response:",
    err.response?.data
);


        if (
            err.code === "ECONNABORTED"
        ) {

            return res.status(504).json({
                success: false,
                error:
                    "The Roblox service took too long to respond."
            });

        }


        if (
            !res.headersSent
        ) {

            return res.status(500).json({
                success: false,
                error:
                    err.message ||
                    "Download failed."
            });

        }


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

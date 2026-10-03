if (assetId === "all_glb" || assetId === "blender_glb" || assetId === "all_obj") {
                try {
                    const avatar3DResponse = await axios.get(
                        "https://thumbnails.roblox.com/v1/users/avatar-3d",
                        {
                            params: { userId: targetUserId },
                            headers: {
                                "User-Agent": "Riglify/1.0",
                                "x-api-key": ROBLOX_API_KEY
                            },
                            timeout: 30000
                        }
                    );

                    const avatar3D = avatar3DResponse.data;
                    const imageUrl = avatar3D?.imageUrl;

                    if (!imageUrl) {
                        throw new Error("Roblox did not return the avatar 3D data URL.");
                    }

                    const modelResponse = await axios.get(imageUrl, {
                        responseType: "json",
                        timeout: 30000,
                        headers: { "User-Agent": "Riglify/1.0" }
                    });

                    const modelData = modelResponse.data;

                    if (!modelData || !modelData.obj) {
                        throw new Error("Roblox did not return OBJ avatar data.");
                    }

                    function robloxCdnUrl(hash) {
                        let value = 31;
                        for (let i = 0; i < Math.min(38, hash.length); i++) {
                            value ^= hash.charCodeAt(i);
                        }
                        const server = ((value % 8) + 8) % 8;
                        return `https://t${server}.rbxcdn.com/${hash}`;
                    }

                    const objUrl = robloxCdnUrl(modelData.obj);
                    const objResponse = await axios.get(objUrl, {
                        responseType: "text",
                        timeout: 30000,
                        headers: { "User-Agent": "Riglify/1.0" }
                    });

                    const tempDir = os.tmpdir();
                    const tempObjPath = path.join(tempDir, `${targetUserId}.obj`);
                    fs.writeFileSync(tempObjPath, objResponse.data);

                    const gltfBuffer = await obj2gltf(tempObjPath, { binary: true });

                    if (fs.existsSync(tempObjPath)) {
                        fs.unlinkSync(tempObjPath);
                    }

                    res.setHeader("Content-Type", "model/gltf-binary");
                    res.setHeader("Content-Disposition", `attachment; filename="Riglify_${targetUserId}.glb"`);
                    return res.send(gltfBuffer);
                } catch (err) {
                    console.error("3D Export Error:", err);
                    return res.status(500).json({ error: err.message || "Failed to process 3D avatar export." });
                }
            }

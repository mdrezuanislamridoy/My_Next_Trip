const bcrypt = require("bcrypt");
const createError = require("http-errors");
const fs = require("fs");

const User = require("../models/user.model");
const sendEmail = require("../utils/sendEmail");
const generateToken = require("../utils/generateToken");
const cloudinary = require("../utils/cloudinary");
const verifyCodeModel = require("../models/verificationCode.model");

const sendCode = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return next(createError(400, "Email is required"));

    const existing = await User.findOne({ email });
    if (existing) return next(createError(409, "User already exists"));

    const code = Math.floor(100000 + Math.random() * 900000);

    await sendEmail(
      email,
      "My Next Trip Verification Code",
      `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
        <h2 style="color: #333;">🔒 Email Verification</h2>
        <p style="font-size: 16px; color: #555;">
          Thank you for signing up for <strong>My Next Trip</strong>! Use the verification code below:
        </p>
        <div style="font-size: 24px; color: #222; background: #f0f0f0; padding: 10px 20px; text-align: center; border-radius: 5px; font-weight: bold; margin: 20px 0;">
          ${code}
        </div>
        <p style="color: #ff0000; font-size: 14px; background: #f9f9f9; padding: 10px; border-left: 4px solid red;">
          🚫 Do not share this code with anyone.
        </p>
        <p style="font-size: 14px; color: #aaa; text-align: center; margin-top: 30px;">
          — My Next Trip Team
        </p>
      </div>
      `
    );

    await verifyCodeModel.create({
      email,
      verificationCode: code.toString(),
      expiresIn: new Date(Date.now() + 15 * 60 * 1000),
    });

    res.status(200).json({ message: "A 6-digit code was sent to your email" });
  } catch (error) {
    next(error);
  }
};

const createUser = async (req, res, next) => {
  try {
    const { name, email, password, verificationCode, role } = req.body;

    console.log(req.body);
    if (!name || !password || !role || !email || !verificationCode)
      return next(createError(400, "All fields are required"));

    const storedCode = await verifyCodeModel.findOne({
      email,
      verificationCode: verificationCode.toString(),
    });

    if (!storedCode) return next(createError(400, "Invalid or expired code"));

    if (storedCode.expiresIn < new Date()) {
      await verifyCodeModel.deleteOne({ _id: storedCode._id });
      return next(createError(400, "Code expired"));
    }

    const hashedPass = await bcrypt.hash(password, 10);
    const roleType = role === "agency" ? "pending" : "no";

    const user = await User.create({
      name,
      email,
      role,
      isAgent: roleType,
      password: hashedPass,
    });

    await verifyCodeModel.deleteOne({ _id: storedCode._id });

    const message =
      roleType === "pending"
        ? "Your account request was submitted. Please wait for verification."
        : "User registered successfully. Go to login page to sign in.";

    res.status(201).json({ message });
  } catch (error) {
    next(error);
  }
};

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return next(createError(400, "All fields are required"));

    const user = await User.findOne({ email });
    if (!user) return next(createError(404, "User not found"));

    if (user.role === "agency" && user.isAgent !== "yes")
      return next(createError(403, "Agency login denied"));

    const passMatch = await bcrypt.compare(password, user.password);
    if (!passMatch) return next(createError(401, "Password does not match"));

    const userData = user.toObject();
    delete userData.password;

    const token = generateToken({ id: userData._id, email: userData.email });

    res
      .status(200)
      .cookie("token", token, { httpOnly: true, secure: true })
      .json({ user: userData, token, message: "Logged in successfully" });
  } catch (error) {
    next(error);
  }
};

const profile = async (req, res, next) => {
  try {
    const userId = req.userId;

    if (!userId) {
      throw new Error("Please login first");
    }

    const user = await User.findById(userId).select("-password");

    if (!user) {
      throw new Error("User Not Found");
    }

    res.status(200).json({ message: "User Data Fetched", user });
  } catch (error) {
    next(error);
  }
};

const updateProfile = async (req, res, next) => {
  try {
    const userId = req.userId;
    const {
      name,
      bio,
      birthDate,
      age,
      gender,
      address,
      phone,
      website,
      description,
      teamSize,
      specialization,
      foundedDate,
    } = req.body;

    console.log(req.body);

    if (!name) return next(createError(400, "Name is required"));

    const user = await User.findById(userId);
    if (!user) return next(createError(404, "User not found"));

    const isAgency = user.role === "agency";

    const updateData = {
      name,
      birthDate,
      address,
      phone,
    };

    if (isAgency) {
      Object.assign(updateData, {
        website,
        description,
        teamSize,
        specialization,
        foundedDate,
      });
    } else {
      Object.assign(updateData, {
        bio,
        age,
        gender,
      });
    }

    const updatedUser = await User.findByIdAndUpdate(userId, updateData, {
      new: true,
    });

    if (!updatedUser) return next(createError(400, "User update failed"));

    res.status(200).json({ message: "Profile updated", user: updatedUser });
  } catch (error) {
    next(error);
  }
};

const updateProfilePicture = async (req, res, next) => {
  try {
    const userId = req.userId;
    const photo = req.file;

    const result = await cloudinary.uploader.upload(photo.path, {
      folder: "sonod/userPhoto",
    });

    fs.unlinkSync(photo.path);

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { profilePic: result.secure_url },
      { new: true }
    );

    res.status(203).json({
      message: "Profile photo updated successfully",
      user: updatedUser,
    });
  } catch (error) {
    next(error);
  }
};

const updateCoverPicture = async (req, res, next) => {
  try {
    const userId = req.userId;
    const photo = req.file;

    const result = await cloudinary.uploader.upload(photo.path, {
      folder: "sonod/coverPhoto",
    });

    fs.unlinkSync(photo.path);

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { coverPic: result.secure_url },
      { new: true }
    );

    res.status(203).json({
      message: "Cover photo updated successfully",
      user: updatedUser,
    });
  } catch (error) {
    next(error);
  }
};

const updatePassword = async (req, res, next) => {
  try {
    const userId = req.userId;
    const { oldPass, newPass } = req.body;

    const user = await User.findById(userId);
    if (!user) return next(createError(404, "User not found"));

    const isMatch = await bcrypt.compare(oldPass, user.password);
    if (!isMatch) return next(createError(401, "Incorrect old password"));

    const hashedPass = await bcrypt.hash(newPass, 10);

    await User.findByIdAndUpdate(userId, { password: hashedPass });

    res.status(200).json({ message: "Password updated successfully" });
  } catch (error) {
    next(error);
  }
};

const forgetPasswordCode = async (req, res, next) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) return next(createError(404, "No user found with this email"));

    const code = Math.floor(100000 + Math.random() * 900000);

    await sendEmail(
      email,
      "Code for Password Reset",
      `<h2>Your password reset code is: <span style="background:blue;color:white">${code}</span></h2>`
    );

    await verifyCodeModel.create({
      email,
      verificationCode: code.toString(),
      expiresIn: new Date(Date.now() + 15 * 60 * 1000),
    });

    res.status(200).json({ message: "Code sent to your email" });
  } catch (error) {
    next(error);
  }
};

const forgetPassword = async (req, res, next) => {
  try {
    const { email, verificationCode, newPassword } = req.body;

    if (!email || !verificationCode || !newPassword)
      return next(createError(400, "All fields are required"));

    const storedCode = await verifyCodeModel.findOne({
      email,
      verificationCode: verificationCode.toString(),
    });

    if (!storedCode) return next(createError(400, "Invalid or expired code"));

    if (storedCode.expiresIn < new Date()) {
      await verifyCodeModel.deleteOne({ _id: storedCode._id });
      return next(createError(400, "Code expired"));
    }

    const hashedPass = await bcrypt.hash(newPassword, 10);

    await User.findOneAndUpdate(
      { email },
      { password: hashedPass },
      { new: true }
    );

    await verifyCodeModel.deleteOne({ _id: storedCode._id });

    res.status(201).json({ message: "Password updated successfully" });
  } catch (error) {
    next(error);
  }
};

const logout = async (req, res, next) => {
  try {
    res.clearCookie("token", {
      httpOnly: true,
      secure: true,
    });

    res.status(200).json({ message: "Logged out successfully" });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  sendCode,
  createUser,
  login,
  profile,
  updateProfile,
  updateProfilePicture,
  updateCoverPicture,
  updatePassword,
  forgetPasswordCode,
  forgetPassword,
  logout,
};

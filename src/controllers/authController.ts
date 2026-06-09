import { Request, Response } from "express";
import { AppDataSource } from "../db/Database";
import { User } from "../entities/User";
import { generateToken, comparePassword } from "../utils/jwt";
import { success, error } from "../utils/response";

const userRepository = AppDataSource.getRepository<User>("User");

export async function login(req: Request, res: Response) {
  const { username, password } = req.body;

  const user = await userRepository.findOne({ where: { username } });
  if (!user) {
    return error(res, "用户名或密码错误", 401);
  }

  if (!user.isActive) {
    return error(res, "账号已被禁用", 401);
  }

  const isValid = await comparePassword(password, user.password);
  if (!isValid) {
    return error(res, "用户名或密码错误", 401);
  }

  const token = generateToken({
    userId: user.id,
    username: user.username,
    role: user.role,
    department: user.department,
  });

  success(res, {
    token,
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      department: user.department,
      phone: user.phone,
      email: user.email,
    },
  }, "登录成功");
}

export async function getCurrentUser(req: Request, res: Response) {
  if (!req.user) {
    return error(res, "未登录", 401);
  }

  const user = await userRepository.findOne({ where: { id: req.user.userId } });
  if (!user) {
    return error(res, "用户不存在", 404);
  }

  success(res, {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    department: user.department,
    phone: user.phone,
    email: user.email,
  });
}

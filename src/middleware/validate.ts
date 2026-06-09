import { Request, Response, NextFunction } from "express";
import { ObjectSchema } from "joi";
import { error } from "../utils/response";

export function validateBody(schema: ObjectSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error: validationError } = schema.validate(req.body, { abortEarly: false });
    if (validationError) {
      const messages = validationError.details.map((d) => d.message).join(", ");
      return error(res, `参数验证失败: ${messages}`, 400);
    }
    next();
  };
}

export function validateQuery(schema: ObjectSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error: validationError } = schema.validate(req.query, { abortEarly: false });
    if (validationError) {
      const messages = validationError.details.map((d) => d.message).join(", ");
      return error(res, `参数验证失败: ${messages}`, 400);
    }
    next();
  };
}

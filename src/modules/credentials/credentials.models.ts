import mongoose, { Schema, type InferSchemaType, type Types } from "mongoose";

const credentialsSchema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true, unique: true, index: true },
    connectionStringEncrypted: { type: String, required: true },
    iv: { type: String, required: true }
  },
  { timestamps: true }
);

export type ProjectCredentialsDoc = InferSchemaType<typeof credentialsSchema> & { _id: Types.ObjectId };
export const ProjectCredentialsModel = mongoose.model("ProjectCredentials", credentialsSchema);


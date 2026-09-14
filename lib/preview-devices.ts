export type PhoneModel = "iphone" | "android" | "duo";

export const phoneModels: { value: PhoneModel; label: string }[] = [
  { value: "iphone", label: "iPhone" },
  { value: "android", label: "Android" },
  { value: "duo", label: "iPhone Duo" },
];

export function previewPhoneWidth(model: PhoneModel, unfolded = false) {
  if (model === "duo" && unfolded) return 740;
  return model === "android" ? 412 : 390;
}

export function previewPhoneLabel(model: PhoneModel, unfolded = false) {
  return model === "duo" ? `iPhone Duo · ${unfolded ? "Unfolded" : "Folded"}` : phoneModels.find((item) => item.value === model)?.label ?? "Phone";
}

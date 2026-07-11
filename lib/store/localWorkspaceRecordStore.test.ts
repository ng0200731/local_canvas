import { beforeEach, describe, expect, it } from "vitest";

import { localWorkspaceRecordStore } from "./localWorkspaceRecordStore";

beforeEach(() => localStorage.clear());

describe("localWorkspaceRecordStore", () => {
  it("creates and updates customer records with employees", async () => {
    const created = await localWorkspaceRecordStore.upsertCustomer(null, {
      company: {
        companyName: "Northstar",
        emailDomainSuffix: "northstar.com",
        type: "Brand owner",
      },
      employees: [
        {
          id: "employee-1",
          userName: "Mia Chen",
          emailPrefix: "mia",
          title: "Manager",
          tel: "+1 555 0001",
        },
      ],
    });

    const updated = await localWorkspaceRecordStore.upsertCustomer(created.id, {
      company: {
        companyName: "Northstar Group",
        emailDomainSuffix: "northstar.com",
        type: "Brand owner",
      },
      employees: [
        {
          id: "employee-1",
          userName: "Mia Chen",
          emailPrefix: "mia",
          title: "Director",
          tel: "+1 555 0001",
        },
      ],
    });

    const records = await localWorkspaceRecordStore.listCustomers();
    expect(records).toHaveLength(1);
    expect(updated.id).toBe(created.id);
    expect(records[0].company.companyName).toBe("Northstar Group");
    expect(records[0].employees[0].title).toBe("Director");
  });

  it("creates supplier records with structured product types", async () => {
    await localWorkspaceRecordStore.upsertSupplier(null, {
      company: {
        companyName: "Bright Trim",
        emailDomainSuffix: "brighttrim.com",
        productTypes: ["label", "zipper"],
      },
      employees: [
        {
          id: "employee-1",
          userName: "Aaron Lee",
          emailPrefix: "aaron",
          title: "Coordinator",
          tel: "+1 555 0002",
        },
      ],
    });

    const records = await localWorkspaceRecordStore.listSuppliers();
    expect(records[0].company.productTypes).toEqual(["label", "zipper"]);
  });

  it("creates and updates product records", async () => {
    const created = await localWorkspaceRecordStore.upsertProduct(null, {
      subject: "Woven label",
      detail: "Main neck label",
      material: "Polyester",
      colorNotes: "Black and white",
      image: {
        name: "label.webp",
        url: "https://example.com/label.webp",
        storagePath: "user/label.webp",
      },
    });

    await localWorkspaceRecordStore.upsertProduct(created.id, {
      subject: "Woven label set",
      detail: "Main neck label and care label",
      material: "Polyester",
      colorNotes: "Black and white",
      image: null,
    });

    const records = await localWorkspaceRecordStore.listProducts();
    expect(records).toHaveLength(1);
    expect(records[0].subject).toBe("Woven label set");
    expect(records[0].image).toBeNull();
  });
});

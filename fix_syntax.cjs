const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

// Find the double bracket and fix it
code = code.replace(`    return res.status(500).json({ status: "error", message: "خطای داخلی سرور هنگام ثبت مرخصی." });
  }
});
  }
});`, `    return res.status(500).json({ status: "error", message: "خطای داخلی سرور هنگام ثبت مرخصی." });
  }
});`);

// Another attempt in case spacing is different
code = code.replace(`    return res.status(500).json({ status: "error", message: "خطای داخلی سرور هنگام ثبت مرخصی." });
  }
});
  }
});`, `    return res.status(500).json({ status: "error", message: "خطای داخلی سرور هنگام ثبت مرخصی." });
  }
});`);

fs.writeFileSync('server.ts', code);

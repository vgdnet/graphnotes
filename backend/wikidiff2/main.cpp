// GraphNotes native wikidiff2 CLI (TZ 3.03 / ADR-018).
// JSON stdin {before, after, context?} → JSON {engine, version, table_html}.
// Compiles Wikimedia src/lib without HAVE_CONFIG_H (std::allocator). PHP is not linked.

#include "TableFormatter.h"
#include "Wikidiff2.h"

#include <cctype>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <iostream>
#include <sstream>
#include <stdexcept>
#include <string>
#include <string_view>

namespace {

constexpr const char *kEngine = "wikidiff2";
constexpr const char *kVersion = "1.14.2";

std::string json_escape(std::string_view raw) {
    std::string out;
    out.reserve(raw.size() + 16);
    for (unsigned char ch : raw) {
        switch (ch) {
            case '"':
                out += "\\\"";
                break;
            case '\\':
                out += "\\\\";
                break;
            case '\b':
                out += "\\b";
                break;
            case '\f':
                out += "\\f";
                break;
            case '\n':
                out += "\\n";
                break;
            case '\r':
                out += "\\r";
                break;
            case '\t':
                out += "\\t";
                break;
            default:
                if (ch < 0x20) {
                    char buf[8];
                    std::snprintf(buf, sizeof(buf), "\\u%04x", ch);
                    out += buf;
                } else {
                    out.push_back(static_cast<char>(ch));
                }
        }
    }
    return out;
}

void skip_ws(const std::string &text, size_t &i) {
    while (i < text.size() && std::isspace(static_cast<unsigned char>(text[i]))) {
        ++i;
    }
}

std::string parse_json_string(const std::string &text, size_t &i) {
    if (i >= text.size() || text[i] != '"') {
        throw std::runtime_error("invalid json");
    }
    ++i;
    std::string out;
    while (i < text.size()) {
        char ch = text[i++];
        if (ch == '"') {
            return out;
        }
        if (ch != '\\') {
            out.push_back(ch);
            continue;
        }
        if (i >= text.size()) {
            throw std::runtime_error("invalid json");
        }
        char esc = text[i++];
        switch (esc) {
            case '"':
            case '\\':
            case '/':
                out.push_back(esc);
                break;
            case 'b':
                out.push_back('\b');
                break;
            case 'f':
                out.push_back('\f');
                break;
            case 'n':
                out.push_back('\n');
                break;
            case 'r':
                out.push_back('\r');
                break;
            case 't':
                out.push_back('\t');
                break;
            case 'u': {
                if (i + 4 > text.size()) {
                    throw std::runtime_error("invalid json");
                }
                unsigned code = 0;
                for (int n = 0; n < 4; ++n) {
                    char hex = text[i++];
                    code <<= 4;
                    if (hex >= '0' && hex <= '9') {
                        code |= static_cast<unsigned>(hex - '0');
                    } else if (hex >= 'a' && hex <= 'f') {
                        code |= static_cast<unsigned>(hex - 'a' + 10);
                    } else if (hex >= 'A' && hex <= 'F') {
                        code |= static_cast<unsigned>(hex - 'A' + 10);
                    } else {
                        throw std::runtime_error("invalid json");
                    }
                }
                if (code < 0x80) {
                    out.push_back(static_cast<char>(code));
                } else if (code < 0x800) {
                    out.push_back(static_cast<char>(0xc0 | (code >> 6)));
                    out.push_back(static_cast<char>(0x80 | (code & 0x3f)));
                } else {
                    out.push_back(static_cast<char>(0xe0 | (code >> 12)));
                    out.push_back(static_cast<char>(0x80 | ((code >> 6) & 0x3f)));
                    out.push_back(static_cast<char>(0x80 | (code & 0x3f)));
                }
                break;
            }
            default:
                throw std::runtime_error("invalid json");
        }
    }
    throw std::runtime_error("invalid json");
}

int64_t parse_json_int(const std::string &text, size_t &i) {
    skip_ws(text, i);
    size_t start = i;
    if (i < text.size() && (text[i] == '-' || text[i] == '+')) {
        ++i;
    }
    if (i >= text.size() || !std::isdigit(static_cast<unsigned char>(text[i]))) {
        throw std::runtime_error("invalid json");
    }
    while (i < text.size() && std::isdigit(static_cast<unsigned char>(text[i]))) {
        ++i;
    }
    return std::strtoll(text.c_str() + start, nullptr, 10);
}

struct Payload {
    std::string before;
    std::string after;
    int context = 3;
};

Payload parse_payload(const std::string &text) {
    size_t i = 0;
    skip_ws(text, i);
    if (i >= text.size() || text[i] != '{') {
        throw std::runtime_error("invalid json");
    }
    ++i;
    Payload payload;
    bool seen_before = false;
    bool seen_after = false;
    while (true) {
        skip_ws(text, i);
        if (i >= text.size()) {
            throw std::runtime_error("invalid json");
        }
        if (text[i] == '}') {
            break;
        }
        std::string key = parse_json_string(text, i);
        skip_ws(text, i);
        if (i >= text.size() || text[i] != ':') {
            throw std::runtime_error("invalid json");
        }
        ++i;
        skip_ws(text, i);
        if (key == "before" || key == "after") {
            std::string value = parse_json_string(text, i);
            if (key == "before") {
                payload.before = std::move(value);
                seen_before = true;
            } else {
                payload.after = std::move(value);
                seen_after = true;
            }
        } else if (key == "context") {
            payload.context = static_cast<int>(parse_json_int(text, i));
        } else {
            if (i < text.size() && text[i] == '"') {
                (void)parse_json_string(text, i);
            } else {
                (void)parse_json_int(text, i);
            }
        }
        skip_ws(text, i);
        if (i < text.size() && text[i] == ',') {
            ++i;
            continue;
        }
        if (i < text.size() && text[i] == '}') {
            break;
        }
        throw std::runtime_error("invalid json");
    }
    if (!seen_before) {
        payload.before.clear();
    }
    if (!seen_after) {
        payload.after.clear();
    }
    if (payload.context < 0 || payload.context > 20) {
        payload.context = 3;
    }
    return payload;
}

wikidiff2::Wikidiff2::Config make_config(int context) {
    wikidiff2::Wikidiff2::Config config{};
    config.numContextLines = context;
    config.changeThreshold = 0.2;
    config.movedLineThreshold = 0.4;
    config.maxMovedLines = 100;
    config.maxWordLevelDiffComplexity = 40000000;
    config.maxSplitSize = 1;
    config.initialSplitThreshold = 0.1;
    config.finalSplitThreshold = 0.6;
    return config;
}

}  // namespace

int main(int argc, char **argv) {
    if (argc == 2 && std::string_view(argv[1]) == "--version") {
        std::cout << kEngine << " " << kVersion << "\n";
        return 0;
    }
    std::ostringstream raw;
    raw << std::cin.rdbuf();
    try {
        Payload payload = parse_payload(raw.str());
        auto config = make_config(payload.context);
        wikidiff2::Wikidiff2 engine(config);
        wikidiff2::TableFormatter formatter;
        engine.addFormatter(formatter);
        engine.execute(payload.before, payload.after);
        const std::string html = formatter.getResult().str();
        std::cout << "{\"engine\":\"" << kEngine << "\",\"version\":\"" << kVersion
                  << "\",\"table_html\":\"" << json_escape(html) << "\"}\n";
        return 0;
    } catch (const std::bad_alloc &) {
        std::cerr << "out of memory\n";
        return 2;
    } catch (const std::exception &exc) {
        std::cerr << exc.what() << "\n";
        return 1;
    }
}

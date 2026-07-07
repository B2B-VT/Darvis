import { useEffect, useState } from "react";
import { SANS, SERIF, MONO, ACCENT, palette, RADIUS } from "../theme.jsx";

const CONTACT_EMAIL = "darvis.b2b@gmail.com";

const PRIVACY_SECTIONS = [
  {
    heading: "University Independence",
    body: [
      "Darvis is an independent student-focused course-planning tool. Unless expressly stated otherwise, Darvis is not affiliated with, endorsed by, operated by, sponsored by, or controlled by Virginia Tech or any university department.",
      "Darvis may reference publicly available, licensed, permitted, student-facing, or user-submitted academic planning information. Darvis is responsible for its own platform, policies, data practices, communications, and services.",
    ],
  },
  {
    heading: "Information We Collect",
    body: [
      "Darvis collects only the information reasonably needed to operate, secure, improve, and provide the service.",
      "Information required to use a feature depends on the feature. Public course browsing may require little or no account information. Account-based features may require authentication information, account identifiers, email address, profile details, saved schedules, selected courses, schedule preferences, chat history, support messages, feedback, or other information you choose to provide.",
      "You may choose to provide a name or email address for waitlist, account, support, feedback, course interests, selected classes, saved schedules, schedule preferences, profile fields, product suggestions, survey responses, AI-assisted planning questions, and account preferences.",
      "If you use Echo, Darvis's internal professor and course review service, Darvis may collect review text, quality ratings, difficulty ratings, course context, optional grade received, selected review tags, attendance/textbook/retake indicators, display name, account identifier, timestamps, moderation status, and security metadata needed to publish, moderate, aggregate, and protect reviews.",
      "Darvis does not require students to provide a student ID, PID, transcript, GPA, academic standing, disability status, medical information, financial information, immigration status, passwords, or official university credentials to use core planning features.",
      "If Darvis later offers optional upload, transcript autofill, resume review, attachment, marketplace, class chat, social feed, or public profile features, Darvis may collect the information you choose to submit through those features. Those features may involve additional notices, consent prompts, visibility controls, or deletion controls.",
      "Darvis may collect limited technical and usage information such as browser type, device type, operating system, approximate region, IP address and server logs where needed, pages visited, features used, timestamps, error logs, latency, referral source, cookie, session, or local storage information.",
      "Darvis may collect limited aggregated, anonymous, or de-identified course-planning metadata such as subject area, course number, request type, route selected, success or failure status, error type, aggregate course search counts, waitlist conversion metrics, feature usage trends, and whether sensitive information may have been detected.",
    ],
  },
  {
    heading: "Raw Query and Prompt Storage",
    body: [
      "Darvis does not use full raw AI prompts as routine analytics records by default. Darvis may process prompts, questions, retrieved course context, and related metadata to provide a response, prevent abuse, detect technical errors, debug failures, maintain security, and improve reliability.",
      "If you use account-based chat history, saved planning history, chat memory, or similar features, Darvis may store conversation content, titles, timestamps, generated answers, tables, charts, warnings, and related context so that the feature works. Users should treat saved conversations as account data and should not include unnecessary sensitive information.",
      "Course-planning questions can reveal sensitive academic or personal context, including concerns about grades, graduation timing, accessibility needs, health, work schedules, family responsibilities, academic performance, or personal circumstances. Darvis is designed to limit routine analytics reliance on raw prompt text and to use aggregated, de-identified, or structured metadata where practical.",
      "Darvis may allow users to delete saved conversations or request deletion of account-associated chat history. Deletion may not immediately remove all backup copies, security logs, abuse-prevention records, or de-identified analytics that no longer identify a user.",
    ],
  },
  {
    heading: "How We Use Information",
    body: [
      "Darvis may use collected information to provide course search, professor/course comparison, grade distribution, schedule-building, waitlist, account, support, feedback, routing, recommendation, AI-assisted explanation, security, reliability, product analytics, communications, legal compliance, and policy enforcement features.",
      "Darvis may use Echo review data to publish user-submitted reviews, calculate aggregate review summaries, improve course and professor discovery, detect abuse or spam, enforce review standards, and build student-facing planning features.",
      "Darvis does not sell student data. Darvis does not use student searches, course interests, schedule preferences, waitlist information, or AI prompts to build advertising profiles.",
    ],
  },
  {
    heading: "No Sale of Student Data",
    body: [
      "Darvis does not sell, rent, trade, or share student personal information for advertising, third-party marketing, or data-broker purposes.",
      "If Darvis uses third-party providers for hosting, analytics, authentication, email delivery, database storage, security, error monitoring, or AI infrastructure, those providers may process limited information only as needed to support Darvis services. Darvis does not authorize those providers to use student personal information for independent advertising, resale, or unrelated profiling.",
    ],
  },
  {
    heading: "AI and Prompt Privacy",
    body: [
      "Darvis may use artificial intelligence to explain course-planning information, summarize available evidence, compare options, and help students understand historical course or professor-related information.",
      "When AI features are used, Darvis aims to send only the information reasonably needed to generate a useful response. This may include the user's prompt, limited conversation context, retrieved course data, schedule context, profile or preference context if enabled, and technical metadata needed for security and reliability.",
      "AI-assisted recommendations may process historical grade distributions, course metadata, section listings, selected filters, and later Echo aggregates if enabled, in order to rank or explain course-planning options.",
      "Darvis may send prompts, retrieved context, and limited metadata to third-party AI infrastructure providers or model providers solely to generate, evaluate, secure, or improve the Darvis response pipeline. Darvis does not authorize third-party AI providers to use Darvis user prompts or student personal information to train their general-purpose models unless Darvis clearly discloses that change and obtains consent where required.",
      "Users should avoid submitting student IDs, transcripts, GPA, medical or disability information, financial information, immigration status, passwords, private credentials, or other sensitive personal information unless a feature expressly asks for that information and explains how it will be used.",
      "AI-generated responses may be incorrect, incomplete, outdated, or based on limited available data. AI responses are planning support only and should be verified using official university systems, academic advisors, registrar tools, degree audits, course catalogs, department resources, and other official sources.",
    ],
  },
  {
    heading: "Sensitive Information",
    body: [
      "Darvis is not designed to collect sensitive personal information. Users should not submit sensitive information unless necessary for a specific support request.",
      "Sensitive information may include student IDs, official university identifiers, GPA, transcripts, degree audits, medical, disability, accessibility, accommodation, financial, immigration, mental health, family circumstance, exact home address, password, authentication code, API key, or private credential information.",
      "If sensitive information is voluntarily submitted, Darvis will use it only as needed to provide the requested feature, respond, maintain security, prevent abuse, or comply with law, and will avoid storing or repeating unnecessary sensitive details where reasonably possible.",
      "If a future feature intentionally asks for transcripts, resumes, degree audits, files, or other sensitive materials, Darvis will provide feature-specific notice and, where appropriate, consent controls before processing that information.",
    ],
  },
  {
    heading: "Cookies and Similar Technologies",
    body: [
      "Darvis may use cookies, local storage, session storage, pixels, or similar technologies to keep users signed in, maintain session state, remember interface preferences, improve performance, understand aggregate usage, support analytics and error monitoring, and protect against abuse or security risks.",
      "Users may be able to disable cookies through browser settings, but some features may not work correctly if cookies or local storage are disabled.",
    ],
  },
  {
    heading: "Third-Party Services and Data Sources",
    body: [
      "Darvis may use third-party services for website hosting, databases, authentication, analytics, email delivery, error monitoring, AI model access, vector or search infrastructure, file storage, security, abuse prevention, and payment processing if paid features are later offered.",
      "These providers may process limited information on Darvis's behalf as service providers or processors. Darvis limits provider access to what is reasonably needed for the service and does not authorize providers to use student personal information for their own independent advertising, resale, unrelated profiling, or model training unless separately disclosed and permitted.",
      "Darvis may link to external websites, including official university pages, course catalogs, registration systems, professor/course resources, public datasets, or third-party review sources. Darvis is not responsible for the privacy practices, accuracy, availability, or content of external websites.",
      "Darvis may use information from public, permitted, licensed, user-submitted, or third-party sources. Some data may be incomplete, outdated, limited by sample size, or unavailable for certain courses, instructors, terms, or departments.",
    ],
  },
  {
    heading: "Data Retention",
    body: [
      "Darvis keeps personal information only as long as reasonably necessary for the purpose it was collected, unless a longer period is required for legal, security, fraud-prevention, or operational reasons.",
      "Account information is generally retained while the account remains active. Saved schedules, saved preferences, saved profile fields, and saved chat history are generally retained until the user deletes them, the account is deleted, the feature is discontinued, or retention is no longer reasonably necessary.",
      "Waitlist information may be retained while access is managed and for a reasonable period afterward. Support messages may be retained long enough to resolve the request, maintain business records, and protect the service. Security logs, fraud-prevention records, rate-limit logs, and abuse-prevention records may be retained for a limited period needed to detect, investigate, or prevent misuse.",
      "Uploaded files, transcripts, resumes, attachments, or similar materials, if supported, should be retained only for the feature purpose disclosed at upload and then deleted, de-identified, or converted into user-controlled saved data when no longer needed.",
      "Anonymous, aggregated, or de-identified metadata may be retained to improve reliability, performance, product quality, and academic planning features. Darvis will delete, de-identify, or aggregate personal information when it is no longer reasonably needed.",
    ],
  },
  {
    heading: "User Choices and Privacy Rights",
    body: [
      "Depending on where you live and which laws apply, you may have rights to access, correct, delete, export, limit use of, opt out of certain processing of, withdraw consent for, appeal decisions about, or avoid discrimination for exercising rights related to personal information.",
      "To make a privacy request, email darvis.b2b@gmail.com with Access, Correction, Deletion, Export, Opt Out, Appeal, or Privacy Request in the subject line. Darvis may need to verify your identity, account ownership, or authority before completing certain requests.",
      "Users may also be able to delete certain saved schedules, chats, profile fields, posts, or account information directly in the product when those controls are available. Darvis will make reasonable efforts to honor applicable privacy requests, but some information may be retained where needed for security, fraud prevention, legal compliance, dispute resolution, backups, or de-identified analytics.",
    ],
  },
  {
    heading: "Student Privacy and Education Records",
    body: [
      "Darvis is not intended to collect official education records from students, such as transcripts, official grades, degree audits, student schedules imported from university systems, disciplinary records, financial aid records, or other protected academic records.",
      "Darvis does not replace official university systems, academic advisors, registrar tools, degree audits, department guidance, or accessibility and accommodations offices.",
      "Darvis will not request or process transcript, GPA, degree audit, official student-record, or university-credential uploads unless a user affirmatively chooses to provide them for a specific feature and Darvis explains the purpose, storage, retention, and deletion options for that feature.",
      "If Darvis later integrates with official student records, student authentication systems, university APIs, or protected education records, Darvis will update this Privacy Policy and implement additional consent, access control, security, and compliance measures before launching those integrations.",
    ],
  },
  {
    heading: "Uploaded Files, Transcripts, and Attachments",
    body: [
      "Darvis may allow optional file attachments, transcript autofill, resume analysis, or similar upload-based features in the future. Darvis will not require those uploads for core course browsing or schedule planning unless the user chooses to use an upload-based feature.",
      "If a user uploads a file, Darvis may process the file contents, file name, file type, file size, extracted text, metadata, and generated outputs to provide the requested feature. Uploaded files may be scanned for security, abuse prevention, malware detection, or technical reliability.",
      "Darvis should provide feature-specific notice for transcript, resume, or official-record uploads, including whether the file is stored, how long it is retained, whether it is sent to third-party service providers, and how the user can delete it.",
    ],
  },
  {
    heading: "Chat History, Memory, and Planning Context",
    body: [
      "Darvis may offer saved chat history, planning history, or memory features so users can continue academic planning across sessions. These features may store prompts, answers, conversation titles, timestamps, retrieved context, selected courses, schedules, preferences, and other planning context tied to an account.",
      "If Darvis offers persistent memory that changes future responses, Darvis should provide controls to view, edit, disable, or delete that memory where practical. Users should avoid storing sensitive academic or personal information in chat memory unless a feature clearly explains why it is needed.",
      "Deleting a visible chat or memory item may remove it from the user interface before all backup, log, or security copies expire.",
    ],
  },
  {
    heading: "Public Profiles, Forums, Class Chat, and User Content",
    body: [
      "Darvis may offer public profiles, forums, class chat, course discussions, ratings, reviews, social feed posts, marketplace listings, or similar user-generated content features. Information posted through those features may be visible to other Darvis users or the public depending on the feature settings.",
      "Echo reviews are intended to be visible to other Darvis users and may be displayed on professor or course pages with the reviewer's chosen display name or account-derived display name, unless Darvis later provides more restrictive visibility controls.",
      "Users should not post private information about themselves or others, including student IDs, grades, transcripts, schedules, health information, contact details, or private messages, unless they intentionally want that information visible in the relevant audience.",
      "Darvis may moderate, remove, limit, or preserve user content where needed for safety, policy enforcement, legal compliance, abuse prevention, or dispute resolution. Deleted public content may persist in backups, cached copies, screenshots, quoted replies, moderation logs, or records needed to protect the service.",
    ],
  },
  {
    heading: "Account Deletion and Data Deletion",
    body: [
      "Users may request deletion of account-associated personal information by contacting darvis.b2b@gmail.com. Darvis may ask users to verify their identity or account ownership before deletion.",
      "Account deletion may delete or de-identify account profile information, saved schedules, saved preferences, and saved chat history where reasonably possible. Some records may be retained where needed for security, fraud prevention, legal compliance, dispute resolution, backups, or de-identified analytics.",
      "Deleting an account may not automatically delete public posts, comments, Echo reviews, ratings, marketplace interactions, or content already shared with other users unless required by law or supported by the relevant feature. Darvis may instead remove account identifiers, hide content, or retain limited moderation records where needed for safety, integrity, legal compliance, or abuse prevention.",
    ],
  },
  {
    heading: "Children and Minors",
    body: [
      "Darvis is intended for college students and users who are at least 13 years old. Darvis does not knowingly collect personal information from children under 13.",
      "Users under 18 should use Darvis only with appropriate permission from a parent or guardian or where otherwise legally permitted.",
    ],
  },
  {
    heading: "Security, International Users, and Changes",
    body: [
      "Darvis uses reasonable administrative, technical, and organizational safeguards to protect information against unauthorized access, misuse, loss, alteration, or disclosure. These safeguards may include access controls, limited internal access, encryption where appropriate, logging, provider security controls, and abuse-prevention systems.",
      "For account-based user content such as Echo reviews, Darvis may use database access controls, row-level security, owner-scoped write permissions, published-only read rules, moderation states, rate limits, and audit or security logs to reduce unauthorized edits, spam, impersonation, and abuse.",
      "No website, database, AI system, or internet transmission is perfectly secure. Darvis cannot guarantee that information will never be accessed, disclosed, altered, or destroyed by a security incident.",
      "If Darvis becomes aware of a security incident affecting personal information, Darvis will evaluate the incident and provide notice where required by applicable law or where Darvis determines notice is appropriate.",
      "Darvis is primarily designed for users in the United States. If you access Darvis from outside the United States, your information may be processed in the United States or other locations where Darvis or its providers operate.",
      "Darvis may update this Privacy Policy as the product, data sources, laws, providers, or data practices change. Continued use of Darvis after changes become effective means you accept the updated Privacy Policy.",
    ],
  },
  {
    heading: "Contact",
    body: ["For privacy questions, requests, or concerns, contact Darvis Privacy Contact at darvis.b2b@gmail.com."],
  },
];

const TERMS_SECTIONS = [
  {
    heading: "What Darvis Is",
    body: [
      "Darvis is a student-focused course-planning and schedule-building platform. It helps users explore grade distributions, historical course data, professor and course insights, timetable-style information, course metadata, visual schedule-building tools, AI-assisted explanations, and student-facing planning context where available.",
      "Darvis is intended to support academic planning. Darvis does not make official academic, registration, advising, or degree decisions.",
    ],
  },
  {
    heading: "University Independence",
    body: [
      "Darvis is an independent platform. Unless expressly stated otherwise, Darvis is not affiliated with, endorsed by, operated by, sponsored by, or controlled by Virginia Tech or any university department.",
      "Virginia Tech does not direct, supervise, or control Darvis and is not responsible for Darvis acts, omissions, contracts, data practices, content, or services.",
    ],
  },
  {
    heading: "No Official Academic Advising",
    body: [
      "Darvis is not an official academic advising service and does not replace academic advisors, registrar systems, degree audits, department guidance, official course catalogs, university timetable or registration systems, accessibility or accommodations offices, graduation checks, or financial aid, billing, or enrollment offices.",
      "Darvis cannot confirm whether a course satisfies a degree requirement, whether a student is eligible to register, whether prerequisites have been met, whether a course will remain available, whether a schedule is appropriate, or whether a student will graduate on time.",
      "Students are responsible for verifying important academic decisions through official university channels.",
    ],
  },
  {
    heading: "Eligibility, Accounts, Waitlist, and Access",
    body: [
      "Darvis is intended for users who are at least 13 years old. If you are under 18, you may use Darvis only if legally permitted and, where required, with permission from a parent or guardian.",
      "Some features may require registration. If you create an account, join a waitlist, or submit access information, you agree to provide accurate information and keep login credentials secure.",
      "Darvis may restrict, suspend, terminate, approve, deny, prioritize, limit, or revoke access, waitlist participation, or early-access participation at its discretion if misuse, abuse, fraud, security risk, unauthorized access, or violation of these Terms is detected.",
    ],
  },
  {
    heading: "Acceptable Use",
    body: [
      "You agree to use Darvis only for lawful academic planning and related personal use.",
      "You agree not to harass, defame, threaten, target, submit harmful content, post another person's private information, re-identify de-identified information, scrape or extract Darvis data without permission, bypass access controls or rate limits, disrupt the platform, upload malware, attack Darvis systems, make misleading claims about people or courses, use Darvis for unauthorized commercial resale, competitive extraction, database creation, model training, or misrepresent Darvis as an official university system.",
      "Darvis may remove content, restrict access, suspend accounts, or take other action if it believes these rules have been violated.",
    ],
  },
  {
    heading: "Professor and Course Discussion Standards",
    body: [
      "Darvis is designed to support evidence-based academic planning, not personal attacks, gossip, harassment, or unsupported claims.",
      "Users may not publish, submit, or promote content that is defamatory, invasive of privacy, threatening, discriminatory, abusive, or targeted at a specific person in a harmful way.",
      "Darvis may moderate, remove, edit, refuse, or limit user-submitted content that violates these Terms, creates legal risk, harms the community, or undermines the purpose of the platform.",
    ],
  },
  {
    heading: "Echo Reviews",
    body: [
      "Echo is a Darvis service for student-submitted professor and course reviews. Echo is designed to help students understand course experience, workload, teaching style, difficulty, and planning tradeoffs from other students' perspectives.",
      "Echo reviews must be based on your own genuine academic experience or clearly identified course-planning context. You may not submit fake reviews, spam, coordinated rating manipulation, impersonation, paid reviews, copied reviews, or content submitted on behalf of someone else without permission.",
      "Echo reviews may include quality ratings, difficulty ratings, course context, optional grade received, review tags, attendance/textbook/retake indicators, and written review text. Do not include student IDs, private schedules, private messages, medical or disability information, contact information, accusations about protected traits, harassment, threats, or unsupported claims about a person.",
      "Darvis may moderate, hide, remove, de-rank, aggregate, or restrict Echo reviews and related accounts if Darvis believes the content is abusive, misleading, unsafe, legally risky, low quality, duplicative, or inconsistent with these Terms.",
      "Echo reviews are subjective user content, not official university data, not academic advising, and not a guarantee of any student's future experience or grade.",
    ],
  },
  {
    heading: "AI Disclaimer",
    body: [
      "Darvis may use artificial intelligence to explain course-planning information, summarize available evidence, and help users compare options.",
      "AI-generated responses may contain mistakes, omissions, outdated information, unsupported assumptions, or incorrect interpretations. Structured facts are retrieved or computed from available data sources where possible, but no AI system is perfect.",
      "AI-assisted course or professor recommendations may be based on limited historical grade data, selected filters, and later user-submitted Echo data if that feature is enabled. These recommendations do not measure every factor that may matter, including teaching style, workload, fit, availability, accessibility, schedule conflicts, prerequisites, advising requirements, or changes in future course delivery.",
      "AI responses are planning support only. They are not academic instructions, professional advising, official university guidance, legal advice, financial advice, medical advice, or guarantees.",
      "Users should verify recommendations with official university systems, academic advisors, course catalogs, syllabi, current section listings, instructor information, and their own research before making enrollment decisions.",
      "Users should not submit sensitive personal information, official student records, passwords, API keys, health information, financial information, or private credentials into AI features unless Darvis expressly asks for that information for a specific feature and explains the related privacy controls.",
    ],
  },
  {
    heading: "Data-Source Limitations",
    body: [
      "Darvis may rely on historical grade distributions, course metadata, timetable-style data, professor/course information, student-facing review sources, public information, third-party sources, and discussion-based context.",
      "Historical grade distributions can show past outcomes, sample sizes, and trends, but do not measure teaching quality, workload, fairness, course difficulty, instructor personality, or whether a particular student will succeed.",
      "Timetable and schedule information may change frequently. Open seats, times, instructor assignments, locations, modalities, restrictions, prerequisites, and registration rules may change without Darvis immediately reflecting the update.",
      "Student reviews and discussion-based sources are subjective and may be biased, outdated, incomplete, exaggerated, inaccurate, or based on limited personal experience.",
    ],
  },
  {
    heading: "User Content and Feedback",
    body: [
      "Darvis may allow users to submit feedback, comments, reviews, questions, prompts, schedule preferences, bug reports, or other content. You are responsible for content you submit.",
      "If Darvis offers public profiles, forums, class chat, course discussions, ratings, reviews, social feeds, marketplace listings, or similar features, content submitted through those features may be visible to other Darvis users or the public depending on the feature settings. Do not submit private information about yourself or others unless you intend to share it with that audience.",
      "You may not submit content that reveals another person's private information, impersonates another person, targets a student, instructor, staff member, or department in a harmful way, or creates legal, safety, privacy, or academic integrity risk.",
      "By submitting an Echo review, you grant Darvis permission to display, store, moderate, analyze, summarize, and use that review and its structured rating fields to operate Echo, calculate aggregate review statistics, improve Darvis planning features, and enforce platform integrity.",
      "By submitting feedback, suggestions, bug reports, ideas, or product requests, you grant Darvis permission to use, copy, modify, analyze, and incorporate that feedback to improve the product without owing compensation.",
    ],
  },
  {
    heading: "Uploads, Transcripts, Attachments, and Resume Tools",
    body: [
      "Darvis may offer optional upload-based features such as transcript autofill, attachment analysis, resume review, or document parsing. These features are optional unless Darvis clearly states otherwise.",
      "By uploading a file, transcript, resume, image, document, or attachment, you represent that you have the right to provide it and authorize Darvis and its service providers to process it for the requested feature, security screening, abuse prevention, technical reliability, and related support.",
      "Do not upload official student records, transcripts, resumes, IDs, medical information, financial information, immigration documents, passwords, or private credentials unless the feature specifically asks for that information and you understand the applicable privacy notice.",
      "Darvis may reject, limit, remove, or disable uploads that appear unsafe, abusive, unauthorized, infringing, sensitive beyond the feature purpose, or inconsistent with these Terms.",
    ],
  },
  {
    heading: "Saved History, Memory, Profiles, and Visibility Controls",
    body: [
      "Darvis may allow users to save schedules, planning preferences, chat history, chat memory, profile fields, posts, comments, ratings, reviews, or other account-based content. You are responsible for reviewing what you save or publish.",
      "If a feature includes visibility controls, you are responsible for choosing the appropriate setting. Darvis may use reasonable defaults, but Darvis is not responsible for information you intentionally make visible to other users or the public.",
      "Echo reviews are treated as published student-facing content unless Darvis provides a more restrictive setting for that review. Removing a review from public display may not immediately remove backup copies, moderation records, abuse-prevention records, or de-identified aggregate statistics.",
      "If Darvis offers chat memory or personalized planning context, the feature is designed to improve future responses, but it may also affect what Cyrus remembers or uses later. Users should delete or disable memory items they do not want used for future planning.",
    ],
  },
  {
    heading: "Marketplace, Payments, and External Transactions",
    body: [
      "If Darvis later offers marketplace, paid, premium, or transaction-based features, additional terms, fees, refund rules, safety rules, payment processor disclosures, and eligibility requirements may apply.",
      "Darvis may use third-party payment, fraud prevention, identity, delivery, or marketplace service providers to support those features. Users should not use Darvis marketplace features to exchange prohibited, unsafe, fraudulent, infringing, or unlawful goods, services, files, credentials, assignments, or academic work.",
    ],
  },
  {
    heading: "Intellectual Property",
    body: [
      "Darvis, including its design, branding, software, interface, written content, data organization, features, workflows, and platform experience, is owned by Darvis or its licensors unless otherwise stated.",
      "You may use Darvis for personal academic planning. You may not copy, modify, distribute, sell, scrape, frame, republish, reverse engineer, or create derivative databases from Darvis content without permission, except where allowed by law or where the content is your own.",
    ],
  },
  {
    heading: "Third-Party Links, Privacy, and Availability",
    body: [
      "Darvis may link to or reference third-party websites. Darvis is not responsible for third-party websites, their accuracy, availability, privacy practices, security, or content.",
      "Your use of Darvis is also governed by the Darvis Privacy Policy, which explains how Darvis may collect, process, store, retain, share, and delete user information, including account data, saved schedules, chat history, AI prompts, uploads, and public user content.",
      "Darvis may be updated, modified, interrupted, delayed, limited, suspended, or discontinued at any time and does not guarantee uninterrupted access, error-free operation, permanent availability, or continued support for any feature.",
    ],
  },
  {
    heading: "Disclaimers and Limitation of Liability",
    body: [
      "Darvis is provided as is and as available. To the fullest extent allowed by law, Darvis disclaims all warranties, including warranties of accuracy, reliability, availability, merchantability, fitness for a particular purpose, non-infringement, and security.",
      "Darvis does not guarantee information accuracy, course availability, instructor assignments, official conflict-free schedules, degree requirement satisfaction, prerequisite eligibility, grades, AI correctness, third-party data reliability, or service availability.",
      "To the fullest extent allowed by law, Darvis and its owners, contributors, team members, affiliates, service providers, and agents will not be liable for indirect, incidental, consequential, special, punitive, exemplary, or similar damages arising from use of the platform.",
    ],
  },
  {
    heading: "Indemnification and Termination",
    body: [
      "You agree to defend, indemnify, and hold harmless Darvis and its owners, contributors, team members, affiliates, service providers, and agents from claims, damages, losses, liabilities, costs, and expenses arising from your use of Darvis, violation of these Terms, submitted content, misuse of Darvis data or outputs, violation of another person's rights, violation of law, or unauthorized scraping, copying, or extraction of Darvis data.",
      "Darvis may suspend, restrict, or terminate your access at any time if Darvis believes you have violated these Terms, created a security risk, misused the platform, submitted harmful content, violated another person's rights, or used Darvis in a way that could harm others, the platform, Darvis, or the university community.",
    ],
  },
  {
    heading: "Account and Content Deletion",
    body: [
      "You may request deletion of account-associated personal information by contacting darvis.b2b@gmail.com. Darvis may need to verify your identity or account ownership before completing the request.",
      "Deletion may remove or de-identify account profile information, saved schedules, saved preferences, and saved chat history where reasonably possible. Darvis may retain information where needed for legal compliance, security, fraud prevention, abuse investigation, dispute resolution, backups, or de-identified analytics.",
      "Deleting an account may not automatically remove public posts, comments, ratings, reviews, marketplace records, messages already delivered to others, moderation records, or content retained for safety, legal, or integrity reasons.",
    ],
  },
  {
    heading: "Changes, Governing Law, and Contact",
    body: [
      "Darvis may update these Terms as the product, data sources, laws, providers, or features change. Continued use of Darvis after changes become effective means you accept the updated Terms.",
      "These Terms are governed by the laws of the Commonwealth of Virginia, without regard to conflict-of-law principles, unless another law applies. Any disputes will be handled in the appropriate state or federal courts located in Virginia, unless applicable law requires otherwise.",
      "For questions about these Terms, contact Darvis Legal / Support Contact at darvis.b2b@gmail.com.",
    ],
  },
];

const DOCS = {
  privacy: {
    eyebrow: "Privacy",
    title: "Darvis Privacy Policy",
    intro: "Darvis is a course-planning and schedule-building platform designed to help students make more informed academic planning decisions. Darvis is built around a simple privacy principle: students should be able to explore courses and schedules without being required to disclose private academic records or unnecessary personal information.",
    sections: PRIVACY_SECTIONS,
  },
  terms: {
    eyebrow: "Terms",
    title: "Darvis Terms of Use",
    intro: "Welcome to Darvis. These Terms of Use govern your access to and use of Darvis, including the website, course-planning tools, schedule builder, professor/course insights, grade distribution features, AI-assisted explanations, waitlist forms, early-access features, and related services.",
    sections: TERMS_SECTIONS,
  },
};

export default function LegalPage({ type = "privacy", darkMode = true, setPage }) {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 760);
  const p = palette(darkMode);
  const doc = DOCS[type] || DOCS.privacy;

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 760);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <main style={{
      minHeight: "100vh",
      fontFamily: SANS,
      color: p.text,
      padding: isMobile ? "36px 18px 72px" : "72px 48px 108px",
      boxSizing: "border-box",
    }}>
      <article style={{
        maxWidth: 820,
        margin: "0 auto",
        background: darkMode ? "rgba(10,9,8,0.58)" : "rgba(255,255,255,0.72)",
        border: `1px solid ${p.line}`,
        borderRadius: isMobile ? RADIUS.lg : RADIUS.xl,
        padding: isMobile ? "28px 22px" : "46px 54px",
        boxShadow: darkMode ? "0 24px 80px rgba(0,0,0,0.26)" : "0 18px 55px rgba(26,18,15,0.08)",
        backdropFilter: "blur(22px)",
        WebkitBackdropFilter: "blur(22px)",
      }}>
        <button
          onClick={() => setPage?.("landing")}
          style={{
            background: "transparent",
            border: `1px solid ${p.line}`,
            borderRadius: RADIUS.pill,
            color: p.textSub,
            cursor: "pointer",
            fontFamily: MONO,
            fontSize: 11,
            fontWeight: 650,
            letterSpacing: "0.8px",
            padding: "8px 13px",
            textTransform: "uppercase",
            marginBottom: 28,
          }}
          onMouseEnter={e => { e.currentTarget.style.color = ACCENT; e.currentTarget.style.borderColor = "rgba(134,31,65,0.45)"; }}
          onMouseLeave={e => { e.currentTarget.style.color = p.textSub; e.currentTarget.style.borderColor = p.line; }}
        >
          ← Home
        </button>

        <div style={{
          fontFamily: MONO,
          color: ACCENT,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "2px",
          textTransform: "uppercase",
          marginBottom: 14,
        }}>{doc.eyebrow}</div>
        <h1 style={{
          fontFamily: SERIF,
          color: p.text,
          fontSize: isMobile ? 38 : 58,
          fontWeight: 400,
          lineHeight: 1.02,
          margin: "0 0 18px",
        }}>{doc.title}</h1>
        <div style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          marginBottom: 24,
          color: p.textSub,
          fontFamily: MONO,
          fontSize: 11,
        }}>
          <span style={{ border: `1px solid ${p.line}`, borderRadius: RADIUS.pill, padding: "5px 10px" }}>Effective Date: June 30, 2026</span>
          <span style={{ border: `1px solid ${p.line}`, borderRadius: RADIUS.pill, padding: "5px 10px" }}>Last Updated: June 30, 2026</span>
        </div>
        <p style={{
          margin: "0 0 34px",
          color: p.textSub,
          fontSize: 15,
          lineHeight: 1.8,
          maxWidth: 720,
        }}>{doc.intro}</p>

        <div style={{ display: "grid", gap: isMobile ? 24 : 30 }}>
          {doc.sections.map((section, index) => (
            <section key={section.heading} style={{ borderTop: index === 0 ? "none" : `1px solid ${p.lineSoft}`, paddingTop: index === 0 ? 0 : 26 }}>
              <h2 style={{
                margin: "0 0 12px",
                color: p.text,
                fontFamily: SERIF,
                fontWeight: 400,
                fontSize: isMobile ? 24 : 30,
                lineHeight: 1.12,
              }}>{section.heading}</h2>
              {section.body.map((paragraph, i) => (
                <p key={i} style={{
                  margin: i === 0 ? 0 : "12px 0 0",
                  color: p.textSub,
                  fontSize: 14,
                  lineHeight: 1.78,
                }}>{paragraph}</p>
              ))}
            </section>
          ))}
        </div>

        <div style={{
          marginTop: 38,
          paddingTop: 22,
          borderTop: `1px solid ${p.line}`,
          display: "flex",
          flexDirection: isMobile ? "column" : "row",
          justifyContent: "space-between",
          gap: 12,
          color: p.textMute,
          fontSize: 12,
          lineHeight: 1.6,
        }}>
          <span>Questions about this document?</span>
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            style={{ color: ACCENT, fontWeight: 700, textDecoration: "none" }}
          >
            {CONTACT_EMAIL}
          </a>
        </div>
      </article>
    </main>
  );
}

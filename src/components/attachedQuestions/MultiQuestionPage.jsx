// MultiQuestionPage.js
import React, { useEffect, useState } from "react";
import "./AttachedQuestions.css"; // Reuse the same CSS
import { database } from "../firebase/FirebaseSetup";
import { ref, get, set } from "firebase/database";
import { ToastContainer, toast } from "react-toastify";
import parse from "html-react-parser";
import DynamicMathSelector from "../DynamicMathSelector";
import { useNavigate } from "react-router-dom"; // To link back to the main page

const MultiQuestionPage = () => {
    const navigate = useNavigate();
    const [multiQuestions, setMultiQuestions] = useState([]); // Stores fetched multi-questions
    const [displayQuestions, setDisplayQuestions] = useState([]); // Flattened list for display
    const [filteredQuestions, setFilteredQuestions] = useState([]);
    const [selectedSetName, setSelectedSetName] = useState("");
    const [error, setError] = useState(null);
    const [setNameError, setSetNameError] = useState("");
    const [loading, setLoading] = useState(false);
    // State to track if the initial fetch attempt has been made
    const [hasFetchedOnce, setHasFetchedOnce] = useState(false);

    // Filter states - Grade initialized to "all"
    const [grade, setGrade] = useState("all");
    const [topic, setTopic] = useState("all");
    const [topicList, setTopicList] = useState("all");
    const [difficultyLevel, setDifficultyLevel] = useState("all");
    const [questionType, setQuestionType] = useState("all");
    const [currentPage, setCurrentPage] = useState(1);
    const questionsPerPage = 50;

    // Helper function to determine if any filter is actively selected (NOT "all" or "")
    const isAnyFilterActive = () => {
        return (
            (grade !== "all" && grade !== "") ||
            (topic !== "all" && topic !== "") ||
            (topicList !== "all" && topicList !== "") ||
            (difficultyLevel !== "all" && difficultyLevel !== "") ||
            (questionType !== "all" && questionType !== "")
        );
    };

    // Function to fetch multi-questions
    const fetchMultiQuestions = async () => {
        // Prevent multiple simultaneous fetches
        if (loading) return;
        setLoading(true);
        setError(null);
        try {
            const multiQuestionsRef = ref(database, "multiQuestions");
            const snapshot = await get(multiQuestionsRef);
            if (!snapshot.exists()) {
                setError("No multi-questions found!");
                setMultiQuestions([]); // Ensure questions array is cleared
                setDisplayQuestions([]);
                // Success, mark that we've fetched (even if nothing was found)
                setHasFetchedOnce(true);
                return;
            }
            const rawData = snapshot.val();

            // --- FIX 1: Ensure subQuestions is an array ---
            let fetchedMultiQuestions = Object.keys(rawData).map((multiQuestionId) => {
                const mqData = rawData[multiQuestionId];
                // Ensure subQuestions is an array, defaulting to an empty array if missing or invalid
                const safeSubQuestions = Array.isArray(mqData.subQuestions) ? mqData.subQuestions : [];

                return {
                    id: multiQuestionId,
                    ...mqData,
                    subQuestions: safeSubQuestions // Override with the safe array
                };
            });
            // --- END FIX 1 ---

            fetchedMultiQuestions.reverse();
            setMultiQuestions(fetchedMultiQuestions);

            // --- CORRECTED FLATTENING LOGIC (PRIORITY TO SUB-QUESTION) ---
            // Flatten for display, prioritizing sub-question properties
            const flattened = fetchedMultiQuestions.flatMap((mq) =>
                mq.subQuestions.map((sq, index) => {
                    // Create the flattened object for this sub-question
                    // 1. Start with properties from the parent multi-question
                    // 2. Then spread properties from the specific sub-question (`sq`)
                    //    This ensures `sq` properties (like its own `type`, `options`, `correctAnswer`) take precedence.
                    const flattenedSubQuestion = {
                        // Properties inherited from parent (if not present on sq)
                        mainQuestionId: mq.id,
                        mainQuestion: mq.mainQuestion,
                        createdAt: mq.createdAt,
                        // Default to parent values, but allow sq to override
                        difficultyLevel: mq.difficultyLevel,
                        grade: mq.grade,
                        topic: mq.topic,
                        topicList: mq.topiclist, // Note: lowercase 'L' in 'topiclist' from your data
                        type: mq.type || "MULTI", // Default type if parent doesn't have one

                        // Spread the specific sub-question's properties last
                        // This ensures sq.type, sq.options, sq.correctAnswer, sq.question, etc.
                        // override any defaults set above IF they exist on `sq`.
                        ...sq,

                        // Add/Override specific computed or inherited metadata
                        // These should generally not be on `sq`, so setting them last is fine.
                        subQuestionIndex: index,
                        totalSubQuestions: mq.subQuestions.length,
                    };

                    return flattenedSubQuestion;
                })
            );
            // --- END CORRECTED FLATTENING LOGIC ---
            // console.log("Flattened Sub-Questions for Display:", flattened); // --- LOG ADDED ---
            setDisplayQuestions(flattened);
            // Success, mark that we've fetched
            setHasFetchedOnce(true);
        } catch (err) {
            console.error("Error fetching multi-questions:", err);
            setError("Failed to fetch multi-questions: " + err.message);
            setMultiQuestions([]); // Ensure questions array is cleared on error
            setDisplayQuestions([]);
            setHasFetchedOnce(true); // Mark as fetched even on error to prevent retries
        } finally {
            setLoading(false);
        }
    };

    // Apply filters and potentially fetch data
    useEffect(() => {
        // --- MODIFIED LOGIC ---
        // If data hasn't been fetched yet AND at least one filter is active, fetch it
        if (!hasFetchedOnce && displayQuestions.length === 0 && isAnyFilterActive()) {
            fetchMultiQuestions();
            return; // Exit effect, it will re-run after fetch updates state
        }
        // If data is loaded (or intentionally empty/errored after fetch) and not loading, apply filters
        if (hasFetchedOnce && !loading) {
            const filtered = displayQuestions.filter((q) => {
                // --- CORRECTED FILTER LOGIC ---
                const matchesGrade = grade === "all" || grade === "" || q.grade === grade;
                const matchesTopic = topic === "all" || topic === "" || q.topic === topic;
                const matchesTopicList = topicList === "all" || topicList === "" || q.topicList === topicList;
                const matchesDifficulty = difficultyLevel === "all" || difficultyLevel === "" || q.difficultyLevel === difficultyLevel;
                const matchesType = questionType === "all" || questionType === "" || q.type === questionType;
                // --- END CORRECTION ---
                return matchesGrade && matchesTopic && matchesTopicList && matchesDifficulty && matchesType;
            });
            setFilteredQuestions(filtered);
            setCurrentPage(1); // Reset to page 1 on new filter
        }
        // --- END MODIFIED LOGIC ---
        // Dependencies
    }, [displayQuestions, grade, topic, topicList, difficultyLevel, questionType, loading, hasFetchedOnce, isAnyFilterActive()]);

    const handleAddToSet = async (mainQuestionId) => {
        if (!selectedSetName.trim()) {
            setSetNameError("❌ Please enter a valid set name!");
            return;
        }
        setSetNameError("");
        const fullMultiQuestion = multiQuestions.find(mq => mq.id === mainQuestionId);
        if (!fullMultiQuestion) {
            toast.error("Multi-question data not found.");
            return;
        }
        try {
            const setRef = ref(database, `attachedQuestionSets/${selectedSetName}`);
            const snapshot = await get(setRef);
            let nextOrder = 0;
            if (snapshot.exists()) {
                const existingSet = snapshot.val();
                const existingQuestion = Object.values(existingSet).find(
                    (item) => item.id === mainQuestionId
                );
                if (existingQuestion) {
                    toast.warning(`⚠️ This multi-question is already in set: ${selectedSetName}`);
                    return;
                }
                const orders = Object.values(existingSet)
                    .map((item) => (typeof item === "object" && item.order !== undefined ? item.order : -1))
                    .filter((order) => order !== -1);
                nextOrder = orders.length > 0 ? Math.max(...orders) + 1 : 0;
            }
            const questionRef = ref(database, `attachedQuestionSets/${selectedSetName}/${mainQuestionId}`);
            await set(questionRef, {
                ...fullMultiQuestion,
                order: nextOrder,
                addedAt: Date.now(),
                isMultiQuestion: true,
            });
            toast.success(`✅ Multi-question added to set: ${selectedSetName} at position ${nextOrder}`);
        } catch (err) {
            console.error("❌ Error adding multi-question to set:", err);
            setError("Failed to attach multi-question to set.");
        }
    };

    const isHTML = (str) => {
        return /<[^>]+>/.test(str);
    };

    const indexOfLast = currentPage * questionsPerPage;
    const indexOfFirst = indexOfLast - questionsPerPage;
    const currentQuestions = filteredQuestions.slice(indexOfFirst, indexOfLast);
    const totalPages = Math.ceil(filteredQuestions.length / questionsPerPage);

    const getVisiblePageNumbers = (currentPage, totalPages, maxVisible = 10) => {
        if (totalPages <= maxVisible) {
            return Array.from({ length: totalPages }, (_, i) => i + 1);
        }
        const halfVisible = Math.floor(maxVisible / 2);
        let startPage = Math.max(1, currentPage - halfVisible);
        let endPage = Math.min(totalPages, currentPage + halfVisible);
        if (currentPage <= halfVisible) {
            endPage = maxVisible;
        }
        if (currentPage + halfVisible >= totalPages) {
            startPage = totalPages - maxVisible + 1;
        }
        const pages = [];
        if (startPage > 1) {
            pages.push(1);
            if (startPage > 2) {
                pages.push('...');
            }
        }
        for (let i = startPage; i <= endPage; i++) {
            pages.push(i);
        }
        if (endPage < totalPages) {
            if (endPage < totalPages - 1) {
                pages.push('...');
            }
            pages.push(totalPages);
        }
        return pages;
    };

    return (
        <div className="allQuestionContainer attachedQuestionsContainer">
            <h2>Multi-Questions</h2>
            {/* <Link to="/">← Back to All Questions</Link>
       */}
            <div className="formGroup">
                <button onClick={() => navigate("/attached-questions")}>
                    ← Back to All Questions
                </button>
            </div>
            <hr />
            <div className="set-name-input">
                <input
                    type="text"
                    value={selectedSetName}
                    onChange={(e) => setSelectedSetName(e.target.value)}
                    placeholder="Enter set name"
                    className="set-name-field"
                />
                {setNameError && <p style={{ color: "red" }}>{setNameError}</p>}
            </div>
            <hr />
            <div className="filterControls">
                <div className="horizontal-filters">
                    <DynamicMathSelector
                        grade={grade}
                        setGrade={setGrade}
                        topic={topic}
                        setTopic={setTopic}
                        topicList={topicList}
                        setTopicList={setTopicList}
                    />
                    <div className="formGroup">
                        <label htmlFor="questionTypeFilter">Question Type:</label>
                        <select
                            id="questionTypeFilter"
                            value={questionType}
                            onChange={(e) => setQuestionType(e.target.value)}
                        >
                            <option value="all">All Types</option>
                            <option value="MCQ">MCQ</option>
                            <option value="FILL_IN_THE_BLANKS">Fill in the Blanks</option>
                            {/* Add other question types as needed based on your sub-question data */}
                        </select>
                    </div>
                    <div className="formGroup">
                        <label htmlFor="difficultyFilter">Difficulty Level:</label>
                        <select
                            id="difficultyFilter"
                            value={difficultyLevel}
                            onChange={(e) => setDifficultyLevel(e.target.value)}
                        >
                            <option value="all">All Difficulty Levels</option>
                            {["L1", "L2", "L3", "Br"].map((level) => <option key={level} value={level}>{level}</option>)}
                        </select>
                    </div>
                </div>
            </div>
            {error && <p style={{ color: "red" }}>{error}</p>}
            {/* Show loading message below filters */}
            {loading && <p>Loading multi-questions...</p>}
            {/* Show content (stats, questions, pagination) only when not loading and no error */}
            {!loading && !error && (
                <>
                    {/* Show instruction if no fetch has happened and no filters are active */}
                    {!hasFetchedOnce && !isAnyFilterActive() && (
                        <p>Please select a filter to load multi-questions.</p>
                    )}
                    {/* Show stats and questions only if data has been fetched */}
                    {hasFetchedOnce && (
                        <>
                            <div className="questionStats">
                                <p>Showing {currentQuestions.length} of {filteredQuestions.length} filtered sub-questions (Total Multi-Questions: {multiQuestions.length})</p>
                            </div>
                            {/* Check for "No questions found" after loading, filtering, and ensuring no error */}
                            {filteredQuestions.length === 0 ? (
                                // More specific message based on whether filters were applied
                                isAnyFilterActive() ? (
                                    <p>No sub-questions match the selected filters.</p>
                                ) : (
                                    <p>Please select a filter to load multi-questions.</p>
                                )
                            ) : (
                                <div className="questionList attachedQuestionList">
                                    <ol>
                                        {currentQuestions.map((q) => (
                                            <li key={`${q.mainQuestionId}-${q.subQuestionIndex}`} className="questionItem attachedQuestionItem">
                                                {/* --- DISPLAY MAIN AND SUB-QUESTIONS --- */}
                                                {/* Use <div> instead of <p> to prevent HTML nesting errors if q.mainQuestion/q.question contains <p> */}
                                                <div><strong>Main Question ({q.subQuestionIndex + 1}/{q.totalSubQuestions}):</strong> {isHTML(q.mainQuestion) ? parse(q.mainQuestion) : q.mainQuestion}</div>
                                                <div><strong>Sub-Question:</strong> {isHTML(q.question) ? parse(q.question) : q.question}</div>
                                                <div className="questionMeta">
                                                    {q.grade && <span className="tag">Grade: {q.grade}</span>}
                                                    {q.topic && <span className="tag">Topic: {q.topic}</span>}
                                                    {q.topicList && <span className="tag">Subtopic: {q.topicList}</span>}
                                                    {q.difficultyLevel && <span className="tag">Difficulty: {q.difficultyLevel}</span>}
                                                    {/* Display the sub-question's specific type */}
                                                    {q.type && <span className="tag">SQ Type: {q.type}</span>}
                                                </div>
                                                {q.questionImage && (
                                                    <div>
                                                        <img
                                                            src={q.questionImage}
                                                            alt="Question Attachment"
                                                            style={{ maxWidth: "300px", marginTop: "10px" }}
                                                        />
                                                    </div>
                                                )}
                                                {/* --- DYNAMICALLY RENDER BASED ON THE SUB-QUESTION'S OWN TYPE --- */}
                                                {/* Check q.type to decide how to display this specific sub-question */}
                                                {q.type === "MCQ" && Array.isArray(q.options) && q.options.length > 0 && (
                                                    <div> {/* Use <div> for layout */}
                                                        <strong>Options:</strong>
                                                        <ul>
                                                            {q.options.map((option, index) => (
                                                                <li key={index}>
                                                                    {/* Handle potential HTML in option text */}
                                                                    {isHTML(option.text || option) ? parse(option.text || option) : (option.text || option)}
                                                                    {option.image && (
                                                                        <img
                                                                            src={option.image}
                                                                            alt={`Option ${index + 1} Image`}
                                                                            style={{ maxWidth: "100px", marginLeft: "10px", display: 'inline-block' }} // Inline image
                                                                        />
                                                                    )}
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                )}
                                                {/* Display the sub-question's specific correct answer */}
                                                {q.correctAnswer && (
                                                    <div> {/* Use <div> for layout */}
                                                        <strong>Correct Answer:</strong>{" "}
                                                        {/* Handle potential HTML in correct answer text */}
                                                        {isHTML(q.correctAnswer.text || q.correctAnswer) ? parse(q.correctAnswer.text || q.correctAnswer) : (q.correctAnswer.text || q.correctAnswer)}
                                                        {q.correctAnswer.image && (
                                                            <img
                                                                src={q.correctAnswer.image}
                                                                alt="Correct Answer Image"
                                                                style={{ maxWidth: "100px", marginLeft: "10px", display: 'inline-block' }} // Inline image
                                                            />
                                                        )}
                                                    </div>
                                                )}
                                                {/* Handle other sub-question types if needed */}
                                                {q.type === "FILL_IN_THE_BLANKS" && (
                                                    <div>
                                                        <strong>Instructions:</strong> Fill in the blanks.
                                                        {/* If FIB has specific answer format, display it */}
                                                        {/* Example: If correctAnswer is the blank, show it */}
                                                        {/* {q.correctAnswer && <span> (Answer: {q.correctAnswer.text || q.correctAnswer}) </span>} */}
                                                    </div>
                                                )}
                                                {/* Add more cases for other question types as needed */}
                                                {/* --- END DYNAMIC RENDERING --- */}
                                                <div> {/* Button container */}
                                                    <button className="addQuestionButton" onClick={() => handleAddToSet(q.mainQuestionId)}>
                                                        {selectedSetName ? `Add multi-question to ${selectedSetName}` : "Add Multi-Question to Set"}
                                                    </button>
                                                </div>
                                            </li>
                                        ))}
                                    </ol>
                                </div>
                            )}
                        </>
                    )}
                    {/* Pagination - Truncated - Show only if data has been fetched and there are pages */}
                    {hasFetchedOnce && totalPages > 1 && (
                        <div className="pagination">
                            {getVisiblePageNumbers(currentPage, totalPages, 10).map((pageNum, index) => (
                                <button
                                    key={`${pageNum}-${index}`}
                                    onClick={() => typeof pageNum === 'number' && setCurrentPage(pageNum)}
                                    className={
                                        currentPage === pageNum
                                            ? "active"
                                            : typeof pageNum === 'number'
                                                ? ""
                                                : "ellipsis"
                                    }
                                    disabled={typeof pageNum !== 'number'}
                                    aria-label={typeof pageNum === 'number' ? `Go to page ${pageNum}` : `Page gap`}
                                >
                                    {pageNum}
                                </button>
                            ))}
                        </div>
                    )}
                </>
            )}
            <ToastContainer />
        </div>
    );
};

export default MultiQuestionPage;
import React, { useState, useEffect } from "react";
import "./AttachedQuestions.css";
import { database } from "../firebase/FirebaseSetup";
import { ref, get, set } from "firebase/database";
import { ToastContainer, toast } from "react-toastify";
import parse from "html-react-parser";
import DynamicMathSelector from "../DynamicMathSelector";

const AttachedQuestion = () => {
  const [questions, setQuestions] = useState([]);
  const [filteredQuestions, setFilteredQuestions] = useState([]);
  const [selectedSetName, setSelectedSetName] = useState("");
  const [error, setError] = useState(null);
  const [setNameError, setSetNameError] = useState("");
  const [loading, setLoading] = useState(false);
  const [hasFetched, setHasFetched] = useState(false); // Tracks if we've already fetched

  // Filter states (all start as "all")
  const [grade, setGrade] = useState("all");
  const [topic, setTopic] = useState("all");
  const [topicList, setTopicList] = useState("all");
  const [difficultyLevel, setDifficultyLevel] = useState("all");
  const [questionType, setQuestionType] = useState("all");

  // Detect if any filter is active (not "all")
  const isAnyFilterActive = () => {
    return (
      grade !== "all" ||
      topic !== "all" ||
      topicList !== "all" ||
      difficultyLevel !== "all" ||
      questionType !== "all"
    );
  };

  // Fetch questions only when any filter is changed (and not already fetched)
  useEffect(() => {
    const shouldFetch = isAnyFilterActive() && !hasFetched && !loading;

    if (shouldFetch) {
      fetchQuestions();
    }
  }, [grade, topic, topicList, difficultyLevel, questionType, hasFetched, loading]);

  const fetchQuestions = async () => {
    setLoading(true);
    setError(null);
    try {
      const questionsRef = ref(database, "questions");
      const snapshot = await get(questionsRef);

      if (!snapshot.exists()) {
        setError("No questions found in the database.");
        setQuestions([]);
        setFilteredQuestions([]);
        setHasFetched(true);
        setLoading(false);
        return;
      }

      const data = snapshot.val();
      const allFetchedQuestions = Object.keys(data)
        .map((questionId) => ({
          id: questionId,
          ...data[questionId],
        }))
        .reverse(); // newest first

      setQuestions(allFetchedQuestions);
      setHasFetched(true);
    } catch (err) {
      console.error("Error fetching questions:", err);
      setError("Failed to load questions. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Apply filters whenever filters change (after fetch)
  useEffect(() => {
    if (!hasFetched) return; // Don't filter until fetched

    const filtered = questions.filter((q) => {
      return (
        (grade === "all" || q.grade === grade) &&
        (topic === "all" || q.topic === topic) &&
        (topicList === "all" || q.topicList === topicList) &&
        (difficultyLevel === "all" || q.difficultyLevel === difficultyLevel) &&
        (questionType === "all" || q.type === questionType)
      );
    });

    setFilteredQuestions(filtered);
  }, [questions, grade, topic, topicList, difficultyLevel, questionType, hasFetched]);

  const handleAddToSet = async (questionId) => {
    if (!selectedSetName.trim()) {
      setSetNameError("❌ Please enter a valid set name!");
      return;
    }
    setSetNameError("");

    try {
      const setRef = ref(database, `attachedQuestionSets/${selectedSetName}`);
      const snapshot = await get(setRef);

      let nextOrder = 0;

      if (snapshot.exists()) {
        const existingSet = snapshot.val();

        const existingQuestion = Object.values(existingSet).find(
          (item) =>
            (typeof item === "string" && item === questionId) ||
            (typeof item === "object" && item.id === questionId)
        );

        if (existingQuestion) {
          toast.warning(`⚠️ This question is already in set: ${selectedSetName}`);
          return;
        }

        const orders = Object.values(existingSet)
          .map((item) => (typeof item === "object" && item.order !== undefined ? item.order : -1))
          .filter((order) => order !== -1);

        nextOrder = orders.length > 0 ? Math.max(...orders) + 1 : 0;
      }

      const questionRef = ref(database, `attachedQuestionSets/${selectedSetName}/${questionId}`);
      await set(questionRef, {
        id: questionId,
        order: nextOrder,
        addedAt: Date.now(),
      });

      toast.success(`✅ Added to set: "${selectedSetName}" at position ${nextOrder}`);
    } catch (err) {
      console.error("❌ Error adding question:", err);
      toast.error("Failed to add question.");
    }
  };

  const isHTML = (str) => /<[^>]+>/.test(str);

  return (
    <div className="allQuestionContainer attachedQuestionsContainer">
      <h2>All Questions</h2>
      <hr />

      {/* Set Name Input */}
      <div className="set-name-input">
        <input
          type="text"
          value={selectedSetName}
          onChange={(e) => setSelectedSetName(e.target.value)}
          placeholder="Enter set name"
          className="set-name-field"
        />
        {setNameError && <p style={{ color: "red", fontSize: "14px" }}>{setNameError}</p>}
      </div>
      <hr />

      {/* Filters */}
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
              <option value="TRIVIA">Trivia</option>
            </select>
          </div>

          <div className="formGroup">
            <label htmlFor="difficultyFilter">Difficulty Level:</label>
            <select
              id="difficultyFilter"
              value={difficultyLevel}
              onChange={(e) => setDifficultyLevel(e.target.value)}
            >
              <option value="all">All Levels</option>
              {["L1", "L2", "L3", "Br"].map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Conditional Rendering Based on State */}
      {!isAnyFilterActive() && !hasFetched && !loading ? (
        <div className="instructionState">
          <p>🔍 Select a filter above to load and view questions.</p>
        </div>
      ) : loading ? (
        <div className="loadingState">
          <p>🔄 Loading questions...</p>
        </div>
      ) : error ? (
        <p style={{ color: "red", textAlign: "center" }}>{error}</p>
      ) : filteredQuestions.length === 0 ? (
        <p style={{ textAlign: "center", color: "#666", fontStyle: "italic" }}>
          No questions match your filters.
        </p>
      ) : (
        <>
          <div className="questionStats">
            <p>
              Showing <strong>{filteredQuestions.length}</strong> question(s)
            </p>
          </div>

          <div className="questionList attachedQuestionList">
            <ol start="0">
              {filteredQuestions.map((q) => (
                <li key={q.id} className="questionItem attachedQuestionItem">
                  <strong>{isHTML(q.question) ? parse(q.question) : q.question}</strong> ({q.type})

                  <div className="questionMeta">
                    {q.grade && <span className="tag">Grade: {q.grade}</span>}
                    {q.topic && <span className="tag">Topic: {q.topic}</span>}
                    {q.topicList && <span className="tag">Subtopic: {q.topicList}</span>}
                    {q.difficultyLevel && <span className="tag">Difficulty: {q.difficultyLevel}</span>}
                  </div>

                  {q.questionImage && (
                    <div className="questionImageContainer">
                      <img
                        src={q.questionImage}
                        alt="Question"
                        style={{ maxWidth: "300px", marginTop: "10px", borderRadius: "8px" }}
                      />
                    </div>
                  )}

                  {q.type === "MCQ" && Array.isArray(q.options) && (
                    <ul className="optionsList">
                      {q.options.map((option, index) => (
                        <li key={index}>
                          {option.text}
                          {option.image && (
                            <img
                              src={option.image}
                              alt={`Option ${index + 1}`}
                              style={{ maxWidth: "100px", marginLeft: "10px", verticalAlign: "middle" }}
                            />
                          )}
                        </li>
                      ))}
                    </ul>
                  )}

                  {q.correctAnswer && (
                    <p className="correctAnswer">
                      <strong>Correct Answer:</strong>{" "}
                      {typeof q.correctAnswer === "object"
                        ? q.correctAnswer.text || ""
                        : q.correctAnswer}
                      {q.correctAnswer.image && (
                        <img
                          src={q.correctAnswer.image}
                          alt="Correct Answer"
                          style={{ maxWidth: "100px", marginLeft: "10px" }}
                        />
                      )}
                    </p>
                  )}

                  <div className="actionButtonContainer">
                    <button
                      className="addQuestionButton"
                      onClick={() => handleAddToSet(q.id)}
                      disabled={!selectedSetName.trim()}
                      title={!selectedSetName.trim() ? "Enter a set name" : ""}
                    >
                      {selectedSetName ? `➕ Add to "${selectedSetName}"` : "Add to Set"}
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </>
      )}

      <ToastContainer position="bottom-right" autoClose={3000} />
    </div>
  );
};

export default AttachedQuestion;